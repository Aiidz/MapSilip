import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load() {
 const exports = {};
 const source = ts.transpileModule(readFileSync('app/lib/pwa/install.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(source,{exports}); return exports;
}
test('installation eligibility is mobile-only, authenticated and independent of push',()=>{
 const {canInviteInstall} = load();
 const phone={authenticated:true,width:390,mobile:true,coarse:true,tablet:false,standalone:false,dismissedUntil:0,now:100};
 assert.equal(canInviteInstall(phone),true);
 for(const change of [{authenticated:false},{width:1440},{mobile:false},{tablet:true},{standalone:true},{dismissedUntil:101}]) assert.equal(canInviteInstall({...phone,...change}),false);
 assert.equal(canInviteInstall({...phone,dismissedUntil:100}),true);
});
test('cooldown is seven days and corrupt/unavailable storage never crashes',()=>{
 const {readDismissal,dismissInstall} = load(); const values=new Map();
 const store={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 assert.equal(readDismissal(store,'u',10),0);
 dismissInstall(store,'u',10);
 assert.equal(readDismissal(store,'u',10),10+7*86400000);
 assert.equal(readDismissal(store,'other',10),0);
 const denied={getItem(){throw Error('denied')},setItem(){throw Error('denied')}};
 assert.equal(readDismissal(denied,'u',10),0); assert.doesNotThrow(()=>dismissInstall(denied,'u',10));
 values.set('mapsilip.install.v1:u','invalid'); assert.equal(readDismissal(store,'u',10),0);
});
