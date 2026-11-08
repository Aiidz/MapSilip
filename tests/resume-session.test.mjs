import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function harness({cookie=true,staff='owner',tenant=false,enabled=true}={}){
 let staffCalls=0,tenantCalls=0;const exports={};
 class BackendError extends Error{constructor(code){super(code);this.code=code;}}
 const modules={
  'next/headers':{cookies:async()=>({getAll:()=>cookie?[{name:'sb-test-auth-token',value:'private'}]:[]})},
  'next/navigation':{redirect:path=>{throw Error('redirect:'+path)}},
  './auth/activation':{isStaffAuthEnabled:()=>enabled},'./tenant-activation':{isTenantAuthEnabled:()=>enabled},
  './server':{requireStaffAccess:async()=>{staffCalls++;if(['owner','caretaker'].includes(staff))return {role:staff};throw new BackendError(staff??'forbidden');}},
  './tenant':{getTenantAccess:async()=>{tenantCalls++;if(!tenant)throw new BackendError('forbidden');return {}; }},'./security':{BackendError}, '../pwa/notification-navigation':{noticeContinuation:value=>typeof value==='string'&&/^[0-9a-f-]{36}$/.test(value)?'/notifications/open?id='+value:null},
 };
 const source=ts.transpileModule(readFileSync('app/lib/backend/resume-session.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(source,{exports,require:name=>{assert.ok(modules[name],name);return modules[name]}});
 return {run:()=>exports.resumeSignedInPortal(),calls:()=>({staffCalls,tenantCalls})};
}
for(const [role,path]of [['owner','/management'],['caretaker','/caretaker']])test('saved '+role+' session resumes its authoritative portal',async()=>{const h=harness({staff:role});await assert.rejects(h.run(),new RegExp('redirect:'+path));assert.equal(h.calls().tenantCalls,0)});
test('active approved tenant resumes tenant portal',async()=>{await assert.rejects(harness({staff:'forbidden',tenant:true}).run(),/redirect:\/tenant/)});
test('anonymous visits do not perform authentication queries',async()=>{const h=harness({cookie:false});await h.run();assert.deepEqual(h.calls(),{staffCalls:0,tenantCalls:0})});
test('revoked sessions and inactive applicants are not automatically admitted',async()=>{for(const staff of ['unauthenticated','forbidden'])await harness({staff}).run()});
test('disabled authentication flags remain enforced',async()=>{const h=harness({enabled:false});await h.run();assert.deepEqual(h.calls(),{staffCalls:0,tenantCalls:0})});
test('service failures are not mistaken for authorization',async()=>{await assert.rejects(harness({staff:'unavailable'}).run(),/unavailable/)});

test('signed-out root redirects to login instead of a tenant-specific start',async()=>{
 const exports={};let resumed=false;
 const modules={'./lib/backend/resume-session':{resumeSignedInPortal:async()=>{resumed=true}},'next/navigation':{redirect:path=>{throw Error('redirect:'+path)}}};
 const source=ts.transpileModule(readFileSync('app/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(source,{exports,require:name=>modules[name]});
 await assert.rejects(exports.default(),/redirect:\/login/);assert.equal(resumed,true);
});
