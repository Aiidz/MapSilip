import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function render(enrolled){
 const prefs={enabled:true,categories:{payments:true,maintenance:true,accounts:true,visitors:true,concerns:false}};
 const calls=[];let index=0;const values=[{available:true,initialized:true,preferences:prefs,enrolled},{pushManager:{getSubscription:async()=>({unsubscribe:async()=>calls.push('unsubscribe')})}},'granted',false,'',enrolled];
 const exports={};const jsx=(type,props)=>({type,props});
 const modules={react:{useState:()=>[values[index++],()=>{}],useEffect:()=>{}},'react/jsx-runtime':{jsx,jsxs:jsx},'../lib/pwa/push-contract':{defaultPushPreferences:prefs},'../lib/pwa/enrollment':{}};
 const source=ts.transpileModule(readFileSync('app/components/PushPreferences.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(source,{exports,require:n=>{assert.ok(n in modules,n);return modules[n]},window:{Notification:{},PushManager:{}},navigator:{serviceWorker:{}},Notification:{permission:'granted'},process:{env:{NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY:'public'}},fetch:async(url,options)=>{calls.push({url,method:options.method});return {ok:true}}});
 const view=exports.PushPreferences({active:true,available:true,ios:false,standalone:false});
 const nodes=[];function walk(node){if(!node||typeof node!=='object')return;nodes.push(node);for(const child of [node.props?.children].flat(Infinity))walk(child)}walk(view);
 return {nodes,calls,text:JSON.stringify(view)};
}
test('unenrolled device offers only its enable action, without account/category controls',()=>{
 const h=render(false);const buttons=h.nodes.filter(n=>n.type==='button');assert.equal(buttons.length,1);assert.equal(buttons[0].props.children,'Enable notifications on this device');assert.equal(h.nodes.filter(n=>n.type==='input').length,0);assert.equal(h.text.includes('Save preferences'),false);assert.equal(h.text.includes('all enrolled devices'),false);
});
test('enrolled device offers only device disable and sends no account preference mutation',async()=>{
 const h=render(true),buttons=h.nodes.filter(n=>n.type==='button');assert.equal(buttons.length,1);assert.equal(buttons[0].props.children,'Disable notifications on this device');await buttons[0].props.onClick();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(h.calls,[{url:'/api/push/subscription',method:'DELETE'},'unsubscribe']);
});
