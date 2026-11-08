import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
function load(){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync('app/lib/backend/push/policy.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports});return exports;}
test('delivery uses finite retry bounds and never retries permanent provider failures',()=>{
 const {deliveryOutcome}=load();
 assert.equal(deliveryOutcome(201,1).kind,'accepted');assert.equal(deliveryOutcome(410,1).kind,'gone');
 assert.equal(deliveryOutcome(403,1).kind,'invalid_subscription');assert.equal(deliveryOutcome(400,1).kind,'discarded');
 for(const [attempt,delay] of [[1,30],[2,120],[3,600],[4,1800]]){const o=deliveryOutcome(503,attempt);assert.equal(o.kind,'retry');assert.equal(o.delaySeconds,delay)}
 assert.equal(deliveryOutcome(503,5).kind,'failed');assert.equal(deliveryOutcome(0,1).kind,'retry');
 assert.equal(deliveryOutcome(429,1,300).delaySeconds,300);
});

test('delivery respects existing staff and tenant auth activation gates',()=>{
 const {recipientAuthEnabled}=load();
 assert.equal(recipientAuthEnabled('owner',{staff:false,tenant:true}),false);
 assert.equal(recipientAuthEnabled('caretaker',{staff:true,tenant:false}),true);
 assert.equal(recipientAuthEnabled('tenant',{staff:true,tenant:false}),false);
 assert.equal(recipientAuthEnabled('other',{staff:true,tenant:true}),false);
});

test('real dispatcher caps batch/concurrency and stops launching work after its deadline',async()=>{
 const {EventEmitter}=await import('node:events');
 for(const simulatedDelay of [0,3000]){
  let active=0,maximum=0,clock=0;const finish=[];const exports={};const policy=load();
  const client={rpc:(name,args)=>{const pending=(async()=>{
   if(name==='mapsilip_push_claim'){assert.equal(args.p_limit,20);return {data:Array.from({length:20},(_,i)=>({id:String(i),token:'claim'}))}}
   if(name==='mapsilip_push_delivery_check')return {data:{...args,id:args.p_id,token:args.p_token,attempt:1,notificationId:'notice',category:'payments',role:'tenant',ttl:100,subscription:{endpoint:'https://fcm.googleapis.com/test',keys:{}}}};
   finish.push(args);return {data:null};
  })();return {abortSignal:()=>pending}}};
  const modules={'server-only':{},'node:https':{request:(_url,options,cb)=>{assert.equal(options.timeout,5000);const out=new EventEmitter();out.end=()=>{active++;maximum=Math.max(maximum,active);setTimeout(()=>{active--;clock+=simulatedDelay;cb({headers:{},statusCode:201,resume(){}})},1)};out.destroy=()=>{};return out}},'@supabase/supabase-js':{createClient:()=>client},'web-push':{default:{setVapidDetails(){},generateRequestDetails:(sub,payload)=>{const body=JSON.parse(payload);assert.equal(body.v,1);assert.deepEqual(Object.keys(body).sort(),['category','notificationId','v']);return {endpoint:sub.endpoint,method:'POST',headers:{},body:payload}}}},'../../supabase/env':{getSupabaseEnvironment:()=>({url:'https://example.supabase.co'})},'../security':{BackendError:class extends Error{}},'./validation':{validateSubscription:v=>v},'./policy':policy,'./config':{pushAvailable:()=>true},'./vapid':{assertVapidPair(){}},'./budget':{withinBudget:(operation)=>operation(new AbortController().signal)},'../auth/activation':{isStaffAuthEnabled:()=>true},'../tenant-activation':{isTenantAuthEnabled:()=>true}};
  class Clock extends Date{static now(){return clock}}
  vm.runInNewContext(ts.transpileModule(readFileSync('app/lib/backend/push/delivery.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>{assert.ok(modules[name],name);return modules[name]},process:{env:{}},AbortSignal,AbortController,Date:Clock,Promise});
  const result=await exports.dispatchPushBatch({limit:100});assert.equal(maximum,4);
  assert.equal(result.accepted,simulatedDelay?8:20);assert.equal(finish.filter(f=>'p_outcome' in f).length,result.accepted);
  if(simulatedDelay){assert.equal(finish.at(-1).p_claims.length,12);assert.equal(result.deferred,12)}
 }
});

test('subscription authorization errors never request global configuration shutdown',()=>{
 const {deliveryOutcome}=load();
 for(const status of [401,403])assert.equal(deliveryOutcome(status,1).kind,'invalid_subscription');
});
