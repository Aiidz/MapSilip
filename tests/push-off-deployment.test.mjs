import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import crypto from 'node:crypto';
class BackendError extends Error{constructor(code){super(code);this.code=code}}
function load(path,modules={},environment={}){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{assert.ok(n in modules,n);return modules[n]},process:{env:environment},Buffer,Request,Response});return exports}
const configured={NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY:'configured',WEB_PUSH_VAPID_PRIVATE_KEY:'configured',WEB_PUSH_VAPID_SUBJECT:'configured',MAPSILIP_PUSH_WORKER_SECRET:'x'.repeat(32),SUPABASE_SERVICE_ROLE_KEY:'configured'};
test('production push defaults off even if all credentials are present',()=>{
 for(const value of [undefined,'false','FALSE','TRUE','1','']){
 const gate=load('app/lib/backend/push/config.ts',{'server-only':{}},{...configured,NODE_ENV:'production',MAPSILIP_PUSH_ENABLED:value});assert.equal(gate.pushAvailable(),false);
 }
});
test('all push routes fail closed without any database or hosted migration',async()=>{
 let dbCalls=0;const gate=load('app/lib/backend/push/config.ts',{'server-only':{}},{...configured,MAPSILIP_PUSH_ENABLED:'false'});
 const blocked=()=>{dbCalls++;throw Error('No hosted migration exists')};
 const response={NextResponse:{json:(body,init)=>({body,...init})}};
 const http=load('app/lib/backend/push/http.ts',{'server-only':{},'next/server':response,'../security':{BackendError,publicBackendError:e=>({code:e.code,status:e.code==='unavailable'?503:400})},'./repository':{PushConflict:class extends Error{}},'../auth/dependencies':{assertRequestOrigin:blocked},'./config':gate});
 const common={'next/server':response,'@/app/lib/backend/push/config':gate,'@/app/lib/backend/push/http':http,'@/app/lib/backend/push/repository':{userPushRpc:blocked,recordRejectedPushAttempt:blocked},'@/app/lib/backend/push/validation':{validatePreferences:blocked,validateEnrollment:blocked}};
 const preferences=load('app/api/push/preferences/route.ts',{...common,'@/app/lib/pwa/push-contract':{defaultPushPreferences:{enabled:false}}});
 const data=await preferences.GET();assert.equal(data.body.available,false);assert.equal((await preferences.PATCH({})).status,503);
 const subscriptions=load('app/api/push/subscription/route.ts',{...common,'node:crypto':crypto,'next/headers':{cookies:blocked}});
 assert.equal((await subscriptions.GET()).body.available,false);
 assert.equal((await subscriptions.POST({})).status,503);assert.equal((await subscriptions.DELETE({})).status,503);
 const dispatcher=load('app/api/push/dispatch/route.ts',{'node:crypto':crypto,'next/server':response,'@/app/lib/backend/push/config':gate,'@/app/lib/backend/push/delivery':{dispatchPushBatch:blocked}},configured);
 assert.equal((await dispatcher.POST(new Request('https://mapsilip.vercel.app/api/push/dispatch',{method:'POST'}))).status,401);
 assert.equal((await dispatcher.POST(new Request('https://mapsilip.vercel.app/api/push/dispatch',{method:'POST',headers:{authorization:'Bearer '+'x'.repeat(32)}}))).status,503);
 assert.equal(dbCalls,0);
});
