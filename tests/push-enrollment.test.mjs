import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
function load(){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync('app/lib/pwa/enrollment.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Uint8Array,atob});return exports;}
test('permission is requested synchronously at the opt-in gesture before enrollment awaits',async()=>{
 const {requestPushConsent}=load();let asked=false;
 const promise=requestPushConsent({permission:'default',requestPermission:()=>{asked=true;return Promise.resolve('granted')}});
 assert.equal(asked,true);assert.equal(await promise,'granted');
 let repeated=false;assert.equal(await requestPushConsent({permission:'denied',requestPermission:()=>{repeated=true}}),'denied');assert.equal(repeated,false);
});
test('additional-device payloads never contain client preference values',()=>{
 const {enrollmentBody}=load();const sub={endpoint:'https://web.push.apple.com/a',keys:{auth:'a',p256dh:'b'}};
 const prefs={enabled:true,categories:{payments:true}};
 assert.equal('initialPreferences' in enrollmentBody(sub,true,prefs),false);
 assert.equal(JSON.stringify(enrollmentBody(sub,false,prefs).initialPreferences),JSON.stringify(prefs));
});
