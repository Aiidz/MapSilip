import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync('app/lib/backend/push/validation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,URL,Buffer,require:name=>{if(name==='../../pwa/push-contract')return {pushCategories:['payments','maintenance','accounts','visitors','concerns']};if(name==='../security')return {BackendError:class extends Error{}};throw Error(name)}});return exports;}
test('only documented HTTPS push endpoints and valid provider keys are accepted',()=>{
 const {validateSubscription}=load();
 const sub={endpoint:'https://fcm.googleapis.com/fcm/send/abc',keys:{p256dh:Buffer.concat([Buffer.from([4]),Buffer.alloc(64,7)]).toString('base64url'),auth:Buffer.alloc(16,2).toString('base64url')}};
 assert.equal(validateSubscription(sub).endpoint,sub.endpoint);
 for(const endpoint of ['http://fcm.googleapis.com/x','https://127.0.0.1/x','https://fcm.googleapis.com.attacker.example/x','https://u:p@web.push.apple.com/x','https://web.push.apple.com:8443/x','https://web.push.apple.com/x#f','https://localhost/x','https://web.push.apple.com./x']) assert.throws(()=>validateSubscription({...sub,endpoint}));
 assert.throws(()=>validateSubscription({...sub,keys:{...sub.keys,auth:'bad'}}));
 assert.throws(()=>validateSubscription({...sub,userId:'victim'}));
});
test('preference and enrollment payloads cannot smuggle stale category updates',()=>{
 const {validatePreferences,validateEnrollment}=load();
 const preferences={enabled:true,categories:{payments:true,maintenance:true,accounts:true,visitors:true,concerns:false}};
 assert.equal(validatePreferences(preferences).enabled,true);
 assert.throws(()=>validatePreferences({...preferences,enabled:'true'}));
 assert.throws(()=>validatePreferences({...preferences,categories:{...preferences.categories,other:true}}));
 const subscription={endpoint:'https://web.push.apple.com/a',keys:{p256dh:Buffer.concat([Buffer.from([4]),Buffer.alloc(64)]).toString('base64url'),auth:Buffer.alloc(16).toString('base64url')}};
 assert.equal(validateEnrollment({subscription}).initialPreferences,undefined);
 assert.equal(validateEnrollment({subscription,initialPreferences:preferences}).initialPreferences.enabled,true);
 assert.throws(()=>validateEnrollment({subscription,preferences}));
});

test('worker rejects unauthorized requests and disabled configuration before touching delivery',async()=>{
 let calls=0;const exports={};const crypto=await import('node:crypto');
 const modules={'node:crypto':crypto,'next/server':{NextResponse:{json:(body,init)=>({body,...init})}},'@/app/lib/backend/push/delivery':{dispatchPushBatch:async()=>{calls++;return {claimed:0}}},'@/app/lib/backend/push/config':{pushAvailable:()=>false}};
 vm.runInNewContext(ts.transpileModule(readFileSync('app/api/push/dispatch/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>modules[name],process:{env:{MAPSILIP_PUSH_WORKER_SECRET:'x'.repeat(32)}},Buffer});
 const unauth=await exports.POST(new Request('https://mapsilip.vercel.app/api/push/dispatch',{method:'POST'}));assert.equal(unauth.status,401);
 const disabled=await exports.POST(new Request('https://mapsilip.vercel.app/api/push/dispatch',{method:'POST',headers:{authorization:'Bearer '+'x'.repeat(32)}}));assert.equal(disabled.status,503);assert.equal(calls,0);
});

test('hung optional push cleanup cannot block authoritative logout indefinitely',async()=>{
 const exports={};let capturedSignal;let timeoutDelay=0;let cleared=false;
 const modules={'server-only':{},'next/headers':{cookies:async()=>({get:()=>({value:'a'.repeat(64)})})},'./config':{pushAvailable:()=>true},'./repository':{userPushRpc:async(_n,_a,signal)=>{capturedSignal=signal;return new Promise(()=>{})}}};
 vm.runInNewContext(ts.transpileModule(readFileSync('app/lib/backend/push/logout.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>modules[name],AbortController,setTimeout:(fn,delay)=>{timeoutDelay=delay;queueMicrotask(fn);return 1},clearTimeout:()=>{cleared=true}});
 await exports.revokePushForCurrentDevice();assert.equal(timeoutDelay,1500);assert.equal(capturedSignal.aborted,true);assert.equal(cleared,true);
});
