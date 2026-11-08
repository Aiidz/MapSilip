import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
function load(path,modules){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{assert.ok(n in modules,n);return modules[n]},AbortSignal});return exports}
class BackendError extends Error{constructor(code){super(code);this.code=code}}
test('malformed HTTP enrollment consumes one attempt; SQL conflicts are not counted twice',async()=>{
 for(const conflict of [false,true]){
 let recorded=0;const modules={
 '@/app/lib/backend/push/config':{pushAvailable:()=>true},
 'node:crypto':{randomBytes:()=>Buffer.alloc(32)},'next/headers':{cookies:async()=>({get:()=>({value:'a'.repeat(64)})})},'next/server':{NextResponse:{json:(body,init)=>({body,...init})}},
 '@/app/lib/backend/push/validation':{validateEnrollment:()=>{if(!conflict)throw new BackendError('invalid_input');return {subscription:{}}}},
 '@/app/lib/backend/push/repository':{recordRejectedPushAttempt:async()=>{recorded++},userPushRpc:async()=>{throw new BackendError('conflict')}},
 '@/app/lib/backend/push/http':{assertPushMutation(){},readPushJson:async()=>({}),pushHeaders:{},pushError:error=>({code:error.code})}};
 const api=load('app/api/push/subscription/route.ts',modules);const result=await api.POST({});assert.equal(recorded,conflict?0:1);assert.equal(result.code,conflict?'conflict':'invalid_input');
 }
});
test('authority rejection is counted separately; committed SQL error envelopes preserve existing client errors',async()=>{
 for(const denied of [true,false]){
 const calls=[];
 const modules={'server-only':{},'../../supabase/server':{createSupabaseServerClient:async()=>({auth:{getClaims:async()=>({data:{claims:{sub:'synthetic-user'}},error:null})},rpc:(name)=>({abortSignal:async()=>{calls.push(name);return {data:{recorded:true},error:null}},then:fn=>{calls.push(name);return Promise.resolve(fn({data:{push_error:'P0409'},error:null}))}})})},'../security':{BackendError},'./identity':{resolvePushIdentity:async()=>{if(denied)throw new BackendError('forbidden')}},'./config':{pushAvailable:()=>true},'./budget':{withinBudget:fn=>fn(new AbortController().signal)}};
 const repo=load('app/lib/backend/push/repository.ts',modules);
 await assert.rejects(repo.userPushRpc('mapsilip_push_subscription_upsert',{}),error=>denied?error.code==='forbidden':error instanceof repo.PushConflict);
 assert.deepEqual(calls,[denied?'mapsilip_push_record_rejection':'mapsilip_push_subscription_upsert']);
 }
});

test('anonymous accounting has no account to charge and cannot replace401 with403',async()=>{
 let calls=0;const modules={'server-only':{},'../../supabase/server':{createSupabaseServerClient:async()=>({auth:{getClaims:async()=>({data:null,error:{message:'no session'}})},rpc:()=>{calls++;throw Error('must not call anonymous RPC')}})},'../security':{BackendError},'./identity':{resolvePushIdentity:async()=>{throw new BackendError('unauthenticated')}},'./config':{pushAvailable:()=>true},'./budget':{withinBudget:fn=>fn(new globalThis.AbortController().signal)}};
 const repo=load('app/lib/backend/push/repository.ts',modules);
 await assert.rejects(repo.userPushRpc('mapsilip_push_subscription_upsert',{}),error=>error.code==='unauthenticated');
 await repo.recordRejectedPushAttempt('subscription');assert.equal(calls,0);
});
