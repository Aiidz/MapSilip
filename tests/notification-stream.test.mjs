import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const uid='11111111-1111-4111-8111-111111111111';
function route({denied=false,sessionUser=uid}={}){
 let handler;const filters=[],removed=[],tokens=[],timers=[],cleared=[];
 class BackendError extends Error{constructor(code){super(code);this.code=code}}
 const channel={on(_type,filter,fn){filters.push(filter);handler=fn;return this},subscribe(fn){fn('SUBSCRIBED');return this}};
 const client={auth:{getSession:async()=>({data:{session:{user:{id:sessionUser},access_token:'synthetic-private-token',expires_at:Date.now()/1000+3600}},error:null})},realtime:{setAuth:async token=>tokens.push(token)},channel:()=>channel,removeChannel:c=>{removed.push(c);return Promise.resolve()}};
 const exports={};vm.runInNewContext(ts.transpileModule(readFileSync('app/api/notifications/live/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Response,ReadableStream,TextEncoder,Date,setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length},setInterval:(fn,ms)=>{timers.push({fn,ms});return timers.length},clearTimeout:id=>cleared.push(id),clearInterval:id=>cleared.push(id),require:name=>name.includes('/supabase/server')?{createSupabaseServerClient:async()=>client}:name.includes('/identity')?{verifyAuthSession:async()=>{if(denied)throw new BackendError('unauthenticated');return {identity:{userId:uid}}}}:{BackendError,publicBackendError:error=>({code:error.code??'unavailable',status:error.code==='unauthenticated'?401:503})}});
 return {GET:exports.GET,maxDuration:exports.maxDuration,filters,removed,tokens,timers,cleared,emit:row=>handler({new:row})};
}
test('stream authenticates HttpOnly session, filters recipient, and never sends tokens or business details',async()=>{
 const h=route(),controller=new AbortController();const res=await h.GET(new Request('https://example.test/api/notifications/live',{signal:controller.signal}));
 assert.equal(res.status,200);assert.match(res.headers.get('Content-Type'),/^text\/event-stream/);assert.match(res.headers.get('Cache-Control'),/no-store/);assert.equal(h.filters[0].filter,'recipient_id=eq.'+uid);assert.equal(h.tokens[0],'synthetic-private-token');
 const id='22222222-2222-4222-8222-222222222222';h.emit({id,recipient_id:uid,event_key:'maintenance:private-event-key',body:'PRIVATE DETAILS',href:'https://attacker.invalid'});h.emit({id:'33333333-3333-4333-8333-333333333333',recipient_id:'other'});
 controller.abort();const body=await res.text();assert.ok(body.includes(id));assert.ok(body.includes('"kind":"maintenance"'));assert.ok(!body.includes('private-event-key'));assert.equal(body.includes('PRIVATE DETAILS'),false);assert.equal(body.includes('synthetic-private-token'),false);assert.equal(body.includes('33333333'),false);assert.equal(h.removed.length,1);
 assert.equal(h.maxDuration,300);assert.ok(h.timers[0].ms<=240000);assert.equal(h.timers[1].ms,20000);assert.ok(h.cleared.length>=2);
});
test('anonymous and mismatched sessions cannot establish notification streams',async()=>{
 for(const options of [{denied:true},{sessionUser:'other'}]){const h=route(options);const res=await h.GET(new Request('https://example.test/api/notifications/live'));assert.equal(res.status,401);assert.equal(h.filters.length,0);assert.equal(h.tokens.length,0)}
});
