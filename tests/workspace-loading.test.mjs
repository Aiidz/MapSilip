import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function loader(fetch) {
  const exports = {};
  const source = ts.transpileModule(readFileSync('app/lib/workspace-loading.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(source, { exports, fetch, URLSearchParams, AbortController, Error });
  return exports;
}

test('invoice lookups include records beyond the first hundred', async () => {
  const pages = [];
  const { fetchOperationRows } = loader(async url => {
    const page = Number(new URL(url, 'https://example.test').searchParams.get('page')); pages.push(page);
    return { ok: true, json: async () => ({ rows: page === 1 ? Array.from({length:100}, (_, id) => ({id})) : [{id:100}], count:101 }) };
  });
  const rows = await fetchOperationRows('invoices');
  assert.equal(rows.length,101); assert.equal(rows[100].id,100); assert.deepEqual(pages,[1,2]);
});

test('lookup pagination reports a failed later page instead of silently truncating', async () => {
  let calls = 0;
  const { fetchOperationRows } = loader(async () => ++calls === 1
    ? { ok:true, json:async () => ({rows:Array(100).fill({}), count:101}) } : {ok:false});
  await assert.rejects(fetchOperationRows('tenants'));
});

test('superseded requests and unmounted requests cannot commit even if transport ignores abort', () => {
  const { createLatestRequest } = loader();
  const requests = createLatestRequest();
  const old = requests.start(); const current = requests.start();
  assert.equal(old.signal.aborted,true); assert.equal(old.isCurrent(),false);
  assert.equal(current.isCurrent(),true);
  requests.cancel(); assert.equal(current.isCurrent(),false); assert.equal(current.signal.aborted,true);
});

function workspace(file, component, props, fetch) {
  let cursor = 0;
  const state = [], callbacks = [], effects = [];
  const jsx = (type, props) => ({type, props});
  const react = {
    useState(value) { const index = cursor++; if (!(index in state)) state[index] = value; return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; },
    useRef(value) { const index = cursor++; return state[index] ??= {current:value}; },
    useCallback(fn) { callbacks.push(fn); return fn; },
    useEffect(fn) { effects.push(fn); },
  };
  const helper = loader(fetch);
  const exports = {};
  const source = ts.transpileModule(readFileSync(`app/components/${file}.tsx`, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.ReactJSX, target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(source, {exports, URLSearchParams, AbortController, fetch, window:{setTimeout,clearTimeout}, require(name) {
    if(name==='react') return react;
    if(name==='react/jsx-runtime') return {jsx,jsxs:jsx};
    if(name==='./DataSkeleton') return {DataSkeleton:'DataSkeleton'};
    if(name.includes('workspace-loading')) return helper;
    if(name==='next/dynamic') return {default:() => () => null};
    if(name==='next/navigation') return {useRouter:()=>({})};
    return {};
  }});
  return {state, callbacks, effects, render() {cursor=0;callbacks.length=0;effects.length=0;return exports[component](props);}};
}

for (const [file, component, props] of [
  ['ManagementPaymentsWorkspace','ManagementPaymentsWorkspace',{}],
  ['ManagementConcernsWorkspace','ManagementConcernsWorkspace',{}],
  ['TenantWorkspace','TenantWorkspace',{kind:'payments'}],
  ['TenantWorkspace','TenantNotifications',{}],
  ['NotificationWorkspace','NotificationWorkspace',{area:'management'}],
]) {
  test(`${component}: late older responses cannot replace the newer records`, async () => {
    const pending = [];
    const h = workspace(file,component,props,url => url === '/api/dashboard'
      ? Promise.resolve({ok:true,json:async()=>({})})
      : new Promise(resolve=>pending.push(resolve)));
    h.render();
    const old = h.callbacks[0](); const current = h.callbacks[0]();
    pending[1]({ok:true,json:async()=>({rows:[{id:'new'}],count:1})}); await current;
    pending[0]({ok:true,json:async()=>({rows:[{id:'old'}],count:1})}); await old;
    const rows = h.state.find(value=>Array.isArray(value)&&value[0]?.id);
    assert.equal(rows[0].id,'new');
  });
}

test('concerns pagination can request records after the hundredth concern', async () => {
  const pages = [];
  const h = workspace('ManagementConcernsWorkspace','ManagementConcernsWorkspace',{}, async url=>{
    pages.push(new URL(url,'https://example.test').searchParams.get('page'));
    return {ok:true,json:async()=>({rows:[{id:pages.length}],count:126})};
  });
  h.render(); await h.callbacks[0]();
  function findNext(node) {
    if(!node || typeof node !== 'object') return;
    if(node.type === 'button' && node.props.children === 'Next') return node;
    for(const child of [node.props?.children].flat(Infinity)) {const found=findNext(child);if(found)return found;}
  }
  for(let i=0;i<4;i++) {const next=findNext(h.render());assert.ok(next);assert.equal(next.props.disabled,false);next.props.onClick();h.render();await h.callbacks[0]();}
  assert.equal(pages.at(-1),'5');
});

test('payment search loads records without requesting or waiting for dashboard metrics',async()=>{
 const urls=[];
 const h=workspace('ManagementPaymentsWorkspace','ManagementPaymentsWorkspace',{},async url=>{
  urls.push(url);return {ok:true,json:async()=>({rows:[{id:'payment'}],count:1})};
 });
 h.render();await h.callbacks[0]();await h.callbacks[0]();
 assert.equal(urls.filter(url=>url==='/api/dashboard').length,0);
 assert.equal(h.state[0][0].id,'payment');
});

test('owner dashboard loads its summary without a redundant recent records request',async()=>{
 const urls=[];
 const h=workspace('DashboardOverview','DashboardOverview',{role:'owner'},async url=>{
  urls.push(url);
  return {ok:true,json:async()=>({pending_payments:7})};
 });
 h.render(); await h.callbacks[0]();
 assert.equal(h.state[0]?.pending_payments,7);
 assert.deepEqual(urls,['/api/dashboard']);
});

test('payment summary refresh ignores older responses and unmounted requests',async()=>{
 const pending=[];
 const h=workspace('ManagementPaymentsWorkspace','ManagementPaymentsWorkspace',{},()=>new Promise(resolve=>pending.push(resolve)));
 h.render();const old=h.callbacks[1]();const latest=h.callbacks[1]();
 pending[1]({ok:true,json:async()=>({pending_payments:2})});await latest;
 pending[0]({ok:true,json:async()=>({pending_payments:9})});await old;
 assert.equal(h.state[6].pending_payments,2);
 const cleanup=h.effects[1]();
 cleanup();pending[2]({ok:true,json:async()=>({pending_payments:99})});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.state[6].pending_payments,2);
});

test('notification first load shows card skeletons, not an empty-state flash',()=>{
 const h=workspace('NotificationWorkspace','NotificationWorkspace',{area:'management'},()=>new Promise(()=>{}));
 const tree=h.render();
 assert.ok(JSON.stringify(tree).includes('\"type\":\"DataSkeleton\"'));
 assert.ok(JSON.stringify(tree).includes('Loading notifications'));
 assert.equal(JSON.stringify(tree).includes('No notifications to display'),false);
});

test('concerns first load reserves the list shape instead of showing no records',()=>{
 const h=workspace('ManagementConcernsWorkspace','ManagementConcernsWorkspace',{},()=>new Promise(()=>{}));
 const tree=h.render();
 assert.ok(JSON.stringify(tree).includes('Loading concerns'));
});

test('notification refresh keeps its existing cards while the next request is pending',async()=>{
 let finish;let calls=0;
 const h=workspace('NotificationWorkspace','NotificationWorkspace',{area:'management'},()=>++calls===1
  ? Promise.resolve({ok:true,json:async()=>({rows:[{id:'notice',title:'Existing notice',body:'Update',event_key:'maintenance:test',read_at:null,created_at:'2026-11-08T00:00:00Z',href:'/management'}],count:1})})
  : new Promise(resolve=>{finish=resolve}));
 h.render();await h.callbacks[0]();h.render();const refreshing=h.callbacks[0]();
 const tree=JSON.stringify(h.render());assert.ok(tree.includes('Existing notice'));assert.equal(tree.includes('"type":"DataSkeleton"'),false);
 finish({ok:true,json:async()=>({rows:[],count:0})});await refreshing;
});

test('failed initial notification request stops skeleton and offers retry',async()=>{
 const h=workspace('NotificationWorkspace','NotificationWorkspace',{area:'management'},async()=>({ok:false}));
 h.render();await h.callbacks[0]();const tree=JSON.stringify(h.render());
 assert.equal(tree.includes('"type":"DataSkeleton"'),false);assert.ok(tree.includes('Notifications could not be loaded.'));assert.ok(tree.includes('Retry'));
});
