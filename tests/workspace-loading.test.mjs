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
    if(name.includes('workspace-loading')) return helper;
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
