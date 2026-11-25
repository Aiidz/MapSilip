import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync('app/lib/pwa/foreground.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports});return exports}
test('platform detection follows device OS instead of desktop window width',()=>{
 const {isMobileNotificationDevice}=load();
 for(const [userAgent,maxTouchPoints,mobile] of [['Windows Chrome',10,false],['Linux Helium',0,false],['Android Mobile',5,true],['iPhone',5,true],['Macintosh',5,true],['Macintosh',0,false]])assert.equal(isMobileNotificationDevice({userAgent,maxTouchPoints}),mobile);
});
test('foreground opt-in is explicit, account scoped and independent of push configuration',()=>{
 const {readForegroundEnabled,writeForegroundEnabled}=load(),values=new Map(),store={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 assert.equal(readForegroundEnabled(store,'owner'),false);writeForegroundEnabled(store,'owner',true);assert.equal(readForegroundEnabled(store,'owner'),true);assert.equal(readForegroundEnabled(store,'tenant'),false);writeForegroundEnabled(store,'owner',false);assert.equal(readForegroundEnabled(store,'owner'),false);
 assert.equal(readForegroundEnabled({getItem(){throw Error()}},'owner'),false);
});
test('new-event guard rejects other accounts and duplicates; bounds retained IDs',()=>{
 const {createNoticeGuard}=load(),guard=createNoticeGuard('owner');
 assert.equal(guard({id:'00000000-0000-4000-8000-000000000001',recipient_id:'other'}),false);
 const row={id:'00000000-0000-4000-8000-000000000001',recipient_id:'owner'};assert.equal(guard(row),true);assert.equal(guard(row),false);assert.equal(guard({id:'bad',recipient_id:'owner'}),false);
});

function desktopSettings({permission='default',previous=false,brokenPush=false}={}){
 const prefs=load(),values=[false,'default',false,''],storage=new Map(),calls=[];let index=0;
 const window=Object.assign(new EventTarget(),{Notification:{},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}});
 const api={permission,requestPermission:()=>{calls.push('permission');return Promise.resolve('granted')}};
 const modules={react:{useState:()=>{const i=index++;return [values[i],v=>values[i]=v]},useEffect(){}},'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},'./Icon':{Icon:'Icon'},'../lib/pwa/foreground':prefs,'../lib/pwa/enrollment':{requestPushConsent:n=>n.permission==='default'?n.requestPermission():Promise.resolve(n.permission)}};
 const exports={};vm.runInNewContext(ts.transpileModule(readFileSync('app/components/BrowserNotificationSettings.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,Event,window,document:new EventTarget(),Notification:api,navigator:{serviceWorker:{getRegistration:async()=>{if(brokenPush)throw Error('Push unavailable');return previous?{pushManager:{getSubscription:async()=>({unsubscribe:async()=>{calls.push('unsubscribe');return true}})}}:undefined}}},fetch:async(url,opt)=>{calls.push(opt.method);return {ok:true}},require:n=>modules[n]});
 function render(){index=0;return exports.BrowserNotificationSettings({active:true,userId:'owner'})}
 function button(tree){if(tree?.type==='button')return tree;for(const child of [tree?.props?.children].flat(Infinity)){if(child&&typeof child==='object'){const b=button(child);if(b)return b}}}
 return {render,button,calls,window,prefs};
}
test('desktop Enable requests ordinary permission without a push registration, key or enrollment API',async()=>{
 const h=desktopSettings();h.button(h.render()).props.onClick();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(h.calls,['permission']);assert.equal(h.prefs.readForegroundEnabled(h.window.localStorage,'owner'),true);assert.ok(JSON.stringify(h.render()).includes('Disable notifications'));
 h.button(h.render()).props.onClick();assert.equal(h.prefs.readForegroundEnabled(h.window.localStorage,'owner'),false);
});
test('desktop migration unsubscribes existing background push and only deletes its server binding',async()=>{
 const h=desktopSettings({permission:'granted',previous:true});h.button(h.render()).props.onClick();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(h.calls,['unsubscribe','DELETE']);assert.equal(h.prefs.readForegroundEnabled(h.window.localStorage,'owner'),true);
});
test('denied desktop permission never enrolls or enables alerts',async()=>{
 const h=desktopSettings({permission:'denied'});h.button(h.render()).props.onClick();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(h.calls,[]);assert.equal(h.prefs.readForegroundEnabled(h.window.localStorage,'owner'),false);
});

async function feed({mobile=false,enabled=true,AudioContext}={}){
 const prefs=load(),values=new Map(),window=Object.assign(new EventTarget(),{localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},open:(...args)=>opened.push(args)});
 const document=Object.assign(new EventTarget(),{visibilityState:'visible',hasFocus:()=>true});prefs.writeForegroundEnabled(window.localStorage,'owner',enabled);
 let inserted,cleanup;const shown=[],opened=[],filters=[],removed=[];
 class Notification{static permission='granted';constructor(title,options){this.title=title;this.options=options;shown.push(this)}close(){this.onclose?.()}}
 class EventSource { constructor(url){filters.push(url)} addEventListener(type,callback){if(type==='message')inserted=callback;else if(type==='ready')callback()} close(){removed.push(this)} }
 const exports={};vm.runInNewContext(ts.transpileModule(readFileSync('app/components/ForegroundNotifications.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Event,CustomEvent,EventSource,window,document,Notification,AudioContext,navigator:{locks:{request:async(_key,callback)=>callback()}},require:n=>n==='react'?{useEffect:fn=>{cleanup=fn()}}:n.includes('/foreground')?prefs:{}});
 exports.ForegroundNotifications({userId:'owner',mobile});await new Promise(resolve=>setImmediate(resolve));
 const received=[];window.addEventListener('mapsilip-foreground-notification-received',event=>received.push(event.detail));
 return {shown,opened,filters,removed,received,window,document,emit:row=>inserted?.({data:JSON.stringify(row)}),cleanup};
}
const notice={id:'11111111-1111-4111-8111-111111111111',recipient_id:'owner',body:'PRIVATE TENANT DETAILS',href:'https://attacker.invalid'};
test('desktop live insert uses generic standard Notification, deduplicates, and routes through authenticated resolver',async()=>{
 const h=await feed();try{
  assert.equal(h.shown.length,0,'never replay old notices on connection');assert.equal(h.filters[0],'/api/notifications/live');
  h.emit({...notice,recipient_id:'other'});h.emit({...notice,kind:'maintenance'});h.emit(notice);await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(h.received,['maintenance']);
  assert.equal(h.shown.length,1);assert.equal(h.shown[0].title,'MapSilip');assert.equal(h.shown[0].options.body,'You have a new update.');
  h.shown[0].onclick();assert.equal(h.opened[0][0],'/notifications/open?id='+notice.id);assert.equal(h.opened[0][2],'noopener');
 }finally{h.cleanup()}
 assert.equal(h.removed.length,1);
});
test('foreign live inserts never dispatch the foreground receipt event',async()=>{
 const h=await feed();try{h.emit({...notice,recipient_id:'other'});await new Promise(resolve=>setImmediate(resolve));assert.equal(h.received.length,0)}finally{h.cleanup()}
});
test('mobile foreground updates in-app notices without constructing desktop notifications and disconnects when hidden',async()=>{
 const h=await feed({mobile:true});let updates=0;h.window.addEventListener('mapsilip-notifications-updated',()=>updates++);
 try{h.emit(notice);await new Promise(resolve=>setImmediate(resolve));assert.equal(updates,1);assert.equal(h.shown.length,0);
 h.document.visibilityState='hidden';h.document.dispatchEvent(new Event('visibilitychange'));await new Promise(resolve=>setImmediate(resolve));assert.equal(h.removed.length,1);
 h.emit({...notice,id:'22222222-2222-4222-8222-222222222222'});assert.equal(updates,1);
 }finally{h.cleanup()}
});
test('desktop alerts stay off without explicit opt-in',async()=>{
 const off=await feed({enabled:false});try{off.emit(notice);await new Promise(resolve=>setImmediate(resolve));assert.equal(off.shown.length,0)}finally{off.cleanup()}
});

test('desktop browser alerts still enable when the browser push service is unavailable',async()=>{
 const h=desktopSettings({brokenPush:true});h.button(h.render()).props.onClick();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.prefs.readForegroundEnabled(h.window.localStorage,'owner'),true);assert.deepEqual(h.calls,['permission']);
});

test('a visible live notification chimes after interaction and duplicate events stay quiet', async () => {
 let plays = 0;
 class AudioContext {
  state = 'running';
  currentTime = 1;
  createOscillator() {
   return { frequency: { setValueAtTime() {} }, connect() {}, start() { plays++; }, stop() {} };
  }
  createGain() {
   return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
  }
  async close() {}
 }
 const h = await feed({ mobile: true, enabled: false, AudioContext });
 try {
  h.emit(notice);
  assert.equal(plays, 0);
  h.document.dispatchEvent(new Event('click'));
  const next = { ...notice, id: '22222222-2222-4222-8222-222222222222' };
  h.emit(next);
  h.emit(next);
  assert.equal(plays, 1);
 } finally { h.cleanup(); }
});
