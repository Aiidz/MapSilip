import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import crypto from 'node:crypto';
function load(path,modules={}){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>modules[n],Buffer,AbortController,setTimeout,clearTimeout,Promise});return exports;}
test('budget aborts a hung operation even if the dependency ignores its signal',async()=>{
 const {withinBudget}=load('app/lib/backend/push/budget.ts');let signal;
 await assert.rejects(withinBudget(s=>{signal=s;return new Promise(()=>{})},15),/deadline/);assert.equal(signal.aborted,true);
 assert.equal(await withinBudget(async()=>42,50),42);
});
test('global VAPID pair mismatch is rejected locally before any provider or database work',()=>{
 const {assertVapidPair}=load('app/lib/backend/push/vapid.ts',{'node:crypto':crypto});
 // Published P-256 generator point/private scalar1: synthetic test vector, never a live key.
 const publicKey=Buffer.from('046b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c2964fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5','hex').toString('base64url');
 const one=Buffer.alloc(32);one[31]=1;assert.doesNotThrow(()=>assertVapidPair(publicKey,one.toString('base64url')));
 const two=Buffer.alloc(32);two[31]=2;assert.throws(()=>assertVapidPair(publicKey,two.toString('base64url')));assert.throws(()=>assertVapidPair('invalid','invalid'));
});
