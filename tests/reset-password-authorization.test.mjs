import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
class BackendError extends Error{constructor(code){super(code);this.code=code}}
function compile(path,modules){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{assert.ok(n in modules,n);return modules[n]},Buffer,URLSearchParams,URL,process:{env:{NODE_ENV:'production'}}});return exports}
const grantModule=compile('app/lib/backend/auth/recovery-grant.ts',{'../security':{BackendError}});
function handler({grant,method='recovery',used={value:false}}={}){
 let updates=0;const writes=[];
 const auth={exchangeCodeForSession:async()=>{if(used.value)return {data:{},error:{status:400}};used.value=true;return {data:{session:{},user:{id:'synthetic'}},error:null}},getClaims:async()=>({data:{claims:{sub:'synthetic',amr:[{method}]}},error:null}),updateUser:async()=>{updates++;return {error:null}},signOut:async()=>({error:null})};
 const store={get:()=>grant?{value:grant}:undefined,set:(...args)=>writes.push(args),getAll:()=>[]};
 const modules={'next/headers':{cookies:async()=>store},'next/server':{NextResponse:{json:(body,init)=>({body,...init})}},'@/app/lib/backend/auth/recovery-grant':grantModule,'@/app/lib/backend/auth/dependencies':{assertRequestOrigin(){},createStaffAuthDependencies:async()=>({beginStaffSignin:async()=>({account:{userId:'synthetic',status:'active'}})})},'@/app/lib/backend/auth/activation':{isStaffAuthEnabled:()=>true},'@/app/lib/backend/tenant-activation':{isTenantAuthEnabled:()=>false},'@/app/lib/backend/security':{BackendError},'@/app/lib/backend/auth/http':{noStoreHeaders:()=>({}),parseAuthMutation:async()=>({password:'Synthetic-new-password'}),safeAuthError:error=>({status:error.code==='forbidden'?403:503})},'@/app/lib/supabase/server':{createSupabaseServerClient:async()=>({auth})},'@/app/lib/backend/identity':{verifyAuthSession:async()=>({email:'synthetic@example.invalid',identity:{userId:'synthetic'}})}};
 const route=compile('app/api/auth/reset-password/route.ts',modules);
 return {run:()=>route.POST({}),updates:()=>updates,writes};
}
test('ordinary admitted session without email grant cannot update password',async()=>{const h=handler();assert.equal((await h.run()).status,403);assert.equal(h.updates(),0)});
test('an OAuth/password grant cannot masquerade as recovery using next=/reset-password',async()=>{const grant=grantModule.captureRecoveryGrant(new URLSearchParams('code=11111111-1111-4111-8111-111111111111'));const h=handler({grant,method:'password'});assert.equal((await h.run()).status,403);assert.equal(h.updates(),0)});
test('verified single-use recovery updates once and concurrent replay never updates',async()=>{
 const grant=grantModule.captureRecoveryGrant(new URLSearchParams('code=11111111-1111-4111-8111-111111111111'));const used={value:false};const one=handler({grant,used}),two=handler({grant,used});
 const results=await Promise.all([one.run(),two.run()]);assert.equal(results.filter(r=>r.body?.state==='password-updated').length,1);assert.equal(one.updates()+two.updates(),1);assert.equal(one.writes[0][2].maxAge,0);
});
test('recovery callback carries opaque credential only; consumption is deferred to reset POST',async()=>{
 let authCalls=0;const cookies=[];
 const modules={'next/server':{NextResponse:{redirect:(url,init)=>({url:url.toString(),...init,cookies:{set:(...args)=>cookies.push(args)}})}},'@/app/lib/backend/auth/recovery-grant':grantModule,'@/app/lib/supabase/server':{createSupabaseServerClient:async()=>{authCalls++;throw Error('must not exchange in GET')}},'@/app/lib/backend/auth/dependencies':{getTrustedAppOrigin:()=> 'https://mapsilip.vercel.app'},'@/app/lib/backend/security':{safeReturnPath:(value,allowed,fallback)=>allowed.includes(value)?value:fallback}};
 const route=compile('app/auth/callback/route.ts',modules);const result=await route.GET({nextUrl:new URL('https://mapsilip.vercel.app/auth/callback?next=/reset-password&code=11111111-1111-4111-8111-111111111111')});
 assert.equal(result.url,'https://mapsilip.vercel.app/reset-password');assert.equal(authCalls,0);assert.equal(cookies.length,1);assert.equal(cookies[0][2].httpOnly,true);
});
