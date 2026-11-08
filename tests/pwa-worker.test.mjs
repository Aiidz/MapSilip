import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function harness(fetchImpl=async()=>new Response('network')){
 const listeners={}; const cached=[];
 const fallback=new Response('<html>offline</html>',{headers:{'Content-Type':'text/html'}});
 const self={location:{origin:'https://mapsilip.vercel.app'},addEventListener:(name,fn)=>{listeners[name]=fn}};
 vm.runInNewContext(readFileSync('public/sw.js','utf8'),{self,URL,Response,fetch:fetchImpl,caches:{open:async()=>({addAll:async paths=>cached.push(...paths)}),match:async()=>fallback.clone(),keys:async()=>[],delete:async()=>true}});
 return {listeners,cached,request:async(patch={})=>{
  let result; const headers=new Headers({'Accept':'text/html',...patch.headers});
  listeners.fetch({request:{url:'https://mapsilip.vercel.app/tenant',method:'GET',mode:'navigate',destination:'document',...patch,headers},respondWith:p=>{result=p}});
  return result ? await result : undefined;
 }};
}
test('only failed document navigations get offline HTML; HTTP errors are preserved',async()=>{
 const h=harness(async()=>{throw TypeError('network failure')});
 const result=await h.request(); assert.match(await result.text(),/offline/); assert.match(result.headers.get('Content-Type'),/text\/html/);
 const http=harness(async()=>new Response('forbidden',{status:403})); assert.equal((await http.request()).status,403);
});
test('RSC, prefetch, API, auth and non-document traffic is never intercepted',async()=>{
 const h=harness(async()=>{throw TypeError('offline')});
 for(const patch of [
  {headers:{RSC:'1'}},{headers:{Accept:'text/x-component'}},{headers:{'Next-Router-State-Tree':'tree'}},
  {url:'https://mapsilip.vercel.app/tenant?_rsc=abc'},
  ...['Next-Router-Prefetch','Next-Router-Segment-Prefetch','Purpose','Sec-Purpose'].map(name=>({headers:{[name]:'prefetch'}})),
  ...['/api/x','/auth/callback','/login','/forgot-password','/reset-password'].map(path=>({url:'https://mapsilip.vercel.app'+path})),
  {url:'https://mapsilip.vercel.app/%61pi/private'},{method:'POST'},{url:'https://other.example/tenant'},{mode:'cors',destination:''},{destination:''},
 ]) assert.equal(await h.request(patch),undefined,JSON.stringify(patch));
});
test('installation caches public assets only',async()=>{
 const h=harness(); let done; h.listeners.install({waitUntil:p=>{done=p}}); await done;
 assert.deepEqual(h.cached.sort(),['/icon-192.png','/icon-512.png','/offline.html']);
});

test('push displays generic text and click opens only a fixed same-origin notice route',async()=>{
 const h=harness();const shown=[];const opened=[];
 // Reuse actual worker in a context exposing native notification/click APIs.
 const listeners={};const self={location:{origin:'https://mapsilip.vercel.app'},registration:{showNotification:async(...args)=>shown.push(args)},clients:{matchAll:async()=>[],openWindow:async path=>opened.push(path)},addEventListener:(n,f)=>listeners[n]=f};
 vm.runInNewContext(readFileSync('public/sw.js','utf8'),{self,URL,Response,caches:{},fetch:async()=>{}});
 let done;const id='11111111-1111-4111-8111-111111111111';
 listeners.push({data:{json:()=>({v:1,notificationId:id,category:'payments',body:'PRIVATE'})},waitUntil:p=>{done=p}});await done;
 assert.equal(shown[0][0],'MapSilip');assert.equal(shown[0][1].body,'You have a new payment update.');assert.equal(shown[0][1].body.includes('PRIVATE'),false);
 listeners.notificationclick({notification:{data:{notificationId:id,url:'https://attacker.example'},close(){}},waitUntil:p=>{done=p}});await done;
 assert.equal(opened[0],'https://mapsilip.vercel.app/notifications/open?id='+id);
 assert.ok(h.listeners.fetch);
});
