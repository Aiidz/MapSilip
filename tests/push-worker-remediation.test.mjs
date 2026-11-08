import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {EventEmitter} from 'node:events';
function moduleAt(path,modules={}){
 const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {exports,require:n=>{assert.ok(n in modules,n);return modules[n]},AbortController,AbortSignal,Buffer,Date,Promise,setTimeout,clearTimeout,process:{env:{}}});return exports;
}
function worker({hang,malicious=false,badConfig=false}={}){
 const calls=[],signals=[];let sends=0;const claims=Array.from({length:4},(_,i)=>({id:String(i),token:'claim'}));
 const client={rpc:(name,args)=>({abortSignal:signal=>{
  calls.push({name,args});signals.push({name,signal});
  if(name===hang)return new Promise(()=>{});
  if(name==='mapsilip_push_claim')return Promise.resolve({data:claims,error:null});
  if(name==='mapsilip_push_delivery_check')return Promise.resolve({data:{id:args.p_id,token:args.p_token,attempt:1,notificationId:'notice',category:'payments',role:'tenant',ttl:100,subscription:{endpoint:'https://fcm.googleapis.com/device'+args.p_id}},error:null});
  return Promise.resolve({data:claims.length,error:null});
 }})};
 const exports=moduleAt('app/lib/backend/push/delivery.ts',{
 'server-only':{},'node:https':{request:(url,_options,cb)=>{const out=new EventEmitter();out.end=()=>{sends++;setTimeout(()=>cb({headers:{},statusCode:malicious&&url.endsWith('0')?403:201,resume(){}}),1)};out.destroy=e=>out.emit('error',e);return out}},
 '@supabase/supabase-js':{createClient:()=>client},'web-push':{default:{setVapidDetails(){},generateRequestDetails:(sub,body)=>({endpoint:sub.endpoint,method:'POST',headers:{},body})}},'../../supabase/env':{getSupabaseEnvironment:()=>({url:'https://example.supabase.co'})},
 '../security':{BackendError:class extends Error{}},'../auth/activation':{isStaffAuthEnabled:()=>true},'../tenant-activation':{isTenantAuthEnabled:()=>true},'./validation':{validateSubscription:v=>v},'./policy':moduleAt('app/lib/backend/push/policy.ts'),
 './config':{pushAvailable:()=>true},'./budget':moduleAt('app/lib/backend/push/budget.ts'),'./vapid':{assertVapidPair(){if(badConfig)throw Error('bad config')}}});
 return {run:()=>exports.dispatchPushBatch(),calls,signals,sends:()=>sends};
}
test('malicious403 endpoint cannot stop other accounts in the same dispatcher batch',async()=>{
 const w=worker({malicious:true});const result=await w.run();assert.equal(result.accepted,3);assert.equal(result.discarded,1);assert.equal(w.sends(),4);
 assert.equal(w.calls.filter(c=>c.args.p_outcome==='invalid_subscription').length,1);
 assert.equal(w.calls.some(c=>c.args.p_outcome==='configuration'),false);
});
test('global invalid configuration stops before claiming and does not quarantine endpoints',async()=>{
 const w=worker({badConfig:true});await assert.rejects(w.run());assert.equal(w.calls.length,0);assert.equal(w.sends(),0);
});
for(const stage of ['mapsilip_push_claim','mapsilip_push_delivery_check','mapsilip_push_finish'])test('hung '+stage+' is aborted and recoverable within RPC budget',async()=>{
 const w=worker({hang:stage});const started=Date.now();
 if(stage==='mapsilip_push_claim')await assert.rejects(w.run());else {const result=await w.run();assert.equal(result.deferred,4);assert.equal(w.calls.at(-1).name,'mapsilip_push_release');assert.equal(w.calls.at(-1).args.p_claims.length,4)}
 assert.ok(Date.now()-started<3500);assert.ok(w.signals.filter(s=>s.name===stage).every(s=>s.signal.aborted));
 if(stage!=='mapsilip_push_finish')assert.equal(w.sends(),0);
});
