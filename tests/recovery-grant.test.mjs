import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
class BackendError extends Error{constructor(code){super(code);this.code=code}}
function load(){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync('app/lib/backend/auth/recovery-grant.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Buffer,URLSearchParams,process:{env:{NODE_ENV:'production'}},require:n=>n==='../security'?{BackendError}:{} });return exports}
test('ordinary session or forged grant cannot authorize reset',async()=>{
 const {redeemRecoveryGrant}=load();let called=0;
 const auth={exchangeCodeForSession:async()=>{called++;return {error:{status:400}}},verifyOtp:async()=>{called++;return {error:{status:400}}}};
 await assert.rejects(redeemRecoveryGrant(auth,undefined),e=>e.code==='forbidden');assert.equal(called,0);
 await assert.rejects(redeemRecoveryGrant(auth,'forged'),e=>e.code==='forbidden');assert.equal(called,0);
});
test('PKCE redemption requires verified recovery AMR, not redirect query or storage label',async()=>{
 const {captureRecoveryGrant,redeemRecoveryGrant}=load();
 const grant=captureRecoveryGrant(new URLSearchParams('code=11111111-1111-4111-8111-111111111111'));
 for(const method of ['password','oauth','recovery']){
 const auth={exchangeCodeForSession:async()=>({data:{user:{id:'user'},session:{}},error:null}),getClaims:async()=>({data:{claims:{sub:'user',amr:[{method}]}},error:null})};
 if(method==='recovery')await redeemRecoveryGrant(auth,grant);else await assert.rejects(redeemRecoveryGrant(auth,grant),e=>e.code==='forbidden');
 }
});
test('single-use provider credential permits only one concurrent redemption',async()=>{
 const {captureRecoveryGrant,redeemRecoveryGrant}=load();let used=false;
 const grant=captureRecoveryGrant(new URLSearchParams('token_hash='+'a'.repeat(64)+'&type=recovery'));
 const auth={verifyOtp:async args=>{assert.equal(args.type,'recovery');if(used)return {error:{status:400}};used=true;return {data:{session:{},user:{id:'user'}},error:null}}};
 const results=await Promise.allSettled([redeemRecoveryGrant(auth,grant),redeemRecoveryGrant(auth,grant)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(captureRecoveryGrant(new URLSearchParams('token_hash='+'a'.repeat(64)+'&type=signup')),null);
});
test('grant cookie is short-lived, HttpOnly, secure and limited to reset endpoint',()=>{
 const {recoveryGrantOptions}=load();const options=recoveryGrantOptions();assert.equal(options.httpOnly,true);assert.equal(options.secure,true);assert.equal(options.maxAge,300);assert.equal(options.path,'/api/auth/reset-password');
});
