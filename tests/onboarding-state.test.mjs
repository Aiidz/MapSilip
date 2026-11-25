import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync('app/lib/pwa/onboarding.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,Map});return exports}
test('onboarding saves decisions separately for users and browser/installed contexts',()=>{const m=load(),values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};m.saveDecision('notifications:alice:browser','later',storage);assert.equal(m.readDecision('notifications:alice:browser',storage),'later');assert.equal(m.readDecision('notifications:bob:browser',storage),null);assert.equal(m.readDecision('notifications:alice:app',storage),null)});
test('storage failure keeps the decision in memory without clearing unrelated data',()=>{const m=load(),storage={getItem(){throw Error()},setItem(){throw Error()}};m.saveDecision('welcome','done',storage);assert.equal(m.readDecision('welcome',storage),'done')});
test('setup offers photo, installation, then notifications independently',()=>{
 const {setupStage}=load(); const base={photoDone:false,notificationDone:false,installDone:false,mobile:true,standalone:false,installEligible:true};
 assert.equal(setupStage(base),'profile');
 assert.equal(setupStage({...base,photoDone:true,contactNeeded:true}),'contact');
 assert.equal(setupStage({...base,photoDone:true}),'invite');
 assert.equal(setupStage({...base,photoDone:true,installDone:true}),'notifications');
 assert.equal(setupStage({...base,photoDone:true,installDone:true,notificationDone:true}),null);
});
test('installed and unsupported devices skip installation but still offer notifications',()=>{
 const {setupStage}=load(); const base={photoDone:true,notificationDone:false,installDone:false,standalone:false,installEligible:true};
 for(const change of [{standalone:true},{installEligible:false}]) assert.equal(setupStage({...base,...change}),'notifications');
 assert.equal(setupStage({...base,mobile:false}),'invite');
});
test('skipping a photo does not dismiss installation or notifications',()=>{
 const m=load(), values=new Map(), storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 m.saveDecision('profile:alice','later',storage);
 assert.equal(m.readDecision('install:alice',storage),null);
 assert.equal(m.readDecision('notifications:alice:browser',storage),null);
 assert.equal(m.readDecision('profile:bob',storage),null);
});
