import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
function load(){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync('app/lib/pwa/notification-navigation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports});return exports;}
test('notice continuation accepts only a UUID and a fixed resolver route',()=>{
 const {noticeContinuation}=load();const id='11111111-1111-4111-8111-111111111111';
 assert.equal(noticeContinuation(id),'/notifications/open?id='+id);
 for(const value of [undefined,'https://evil.test','//evil.test',id+'?next=evil','not-a-uuid'])assert.equal(noticeContinuation(value),null);
});
test('notice destinations are exact role-appropriate paths, never arbitrary URLs',()=>{
 const {safeNoticeDestination}=load();assert.equal(safeNoticeDestination('/tenant/maintenance','tenant'),'/tenant/maintenance');
 for(const path of ['/management/tenants','//evil.test','/tenant/../management','/tenant/%2e%2e/management','https://mapsilip.vercel.app/tenant','/tenant?next=evil'])assert.equal(safeNoticeDestination(path,'tenant'),null);
 assert.equal(safeNoticeDestination('/caretaker/maintenance','caretaker'),'/caretaker/maintenance');
});

test('notice resolver scopes records to the current recipient and preserves signed-out UUID only',async()=>{
 const id='11111111-1111-4111-8111-111111111111';
 async function request(actor){
  const exports={};const filters={};class BackendError extends Error{constructor(code){super(code);this.code=code}}
  class NextResponse{constructor(_body,init){Object.assign(this,init)}static redirect(url,init){return {url:url.toString(),...init}}}
  const query={select(){return query},eq(k,v){filters[k]=v;return query},async maybeSingle(){return {data:filters.id===id&&filters.recipient_id==='tenant-a'?{href:'/tenant/payments'}:null,error:null}}};
  const modules={'next/server':{NextResponse},'@/app/lib/backend/push/identity':{resolvePushIdentity:async()=>{if(actor==='signedout')throw new BackendError('unauthenticated');return {userId:actor,role:'tenant'}}},'@/app/lib/supabase/server':{createSupabaseServerClient:async()=>({from:()=>query})},'@/app/lib/backend/security':{BackendError},'@/app/lib/backend/auth/dependencies':{getTrustedAppOrigin:()=> 'https://mapsilip.vercel.app'},'@/app/lib/pwa/notification-navigation':load()};
  vm.runInNewContext(ts.transpileModule(readFileSync('app/notifications/open/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>modules[name],URL});
  return exports.GET(new Request('https://mapsilip.vercel.app/notifications/open?id='+id));
 }
 assert.equal((await request('tenant-a')).url,'https://mapsilip.vercel.app/tenant/payments');
 assert.equal((await request('tenant-b')).status,404);
 assert.equal((await request('signedout')).url,'https://mapsilip.vercel.app/login?notice='+id);
});
