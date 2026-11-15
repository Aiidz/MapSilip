import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function overlayHarness() {
  const slots = []; const listeners = new Map(); let cursor = 0; let effects = []; let closes = 0; let back = 0;
  const dialog = { offsetHeight:400, classList:{ add() {}, remove() {} }, style:{ setProperty() {}, removeProperty() {} }, open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  const history = { state: {}, pushState(state) { this.state = state; }, back() { back++; } };
  const react = {
    useRef(value) { return slots[cursor++] ??= { current: value }; },
    useCallback(fn) { return fn; },
    useId() { return 'overlay-title'; },
    useEffect(fn, deps) { const index = cursor++; const old = slots[index]; if (!old || deps.some((v,i) => v !== old.deps[i])) effects.push(() => { old?.cleanup?.(); slots[index] = { deps, cleanup: fn() }; }); },
  };
  const exports = {}; const jsx = (type, props) => ({ type, props });
  const source = ts.transpileModule(readFileSync('app/components/ResponsiveOverlay.tsx','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, { exports, window: { history, matchMedia: () => ({ matches:true }), addEventListener(name,fn) { listeners.set(name,fn); }, removeEventListener(name) { listeners.delete(name); } }, document: { documentElement: { classList: { add() {}, remove() {} } } }, require(name) { return name === 'react' ? react : { jsx, jsxs: jsx }; } });
  return {
    render(props = {}) { cursor = 0; effects = []; const tree = exports.ResponsiveOverlay({ open:true, onClose: () => closes++, title:'Edit', children:'form', ...props }); tree.props.ref.current = dialog; effects.forEach(fn => fn()); return tree; },
    pop() { listeners.get('popstate')?.(); }, dialog, get closes() { return closes; }, get back() { return back; },
  };
}

test('busy overlay rejects Escape without consuming its back-history entry', () => {
  const h = overlayHarness();const tree = h.render({ dismissible:false });let prevented = false;
  tree.props.onCancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented,true);assert.equal(h.back,0);assert.equal(h.closes,0);assert.equal(h.dialog.open,true);
  h.pop();assert.equal(h.closes,0,'pending saves must retain their overlay on browser back');
});

test('normal overlay close consumes exactly one history entry', () => {
  const h=overlayHarness();const tree=h.render();
  tree.props.onCancel({ preventDefault() {} });
  assert.equal(h.back,1);assert.equal(h.closes,1);
  h.render({ open:false });assert.equal(h.dialog.open,false);assert.equal(h.back,1);
});

function swipe(header, distance, duration = 400) {
  const target = { setPointerCapture() {}, hasPointerCapture() { return true; }, releasePointerCapture() {} };
  const base = { pointerId:1, isPrimary:true, button:0, target:{ closest() { return null; } }, currentTarget:target };
  header.props.onPointerDown({ ...base, clientY:0, timeStamp:0 });
  header.props.onPointerMove({ ...base, clientY:distance, timeStamp:duration });
  header.props.onPointerUp({ ...base, clientY:distance, timeStamp:duration, type:'pointerup' });
}

test('long mobile header drag dismisses and consumes one history entry', () => {
  const h = overlayHarness(); const tree = h.render();
  swipe(tree.props.children[1], 120);
  assert.equal(h.closes, 1); assert.equal(h.back, 1);
});

test('short mobile header drag snaps back without dismissing', () => {
  const h = overlayHarness(); const tree = h.render();
  swipe(tree.props.children[1], 20);
  assert.equal(h.closes, 0); assert.equal(h.back, 0);
});

test('busy mobile popup cannot be dragged closed', () => {
  const h = overlayHarness(); const tree = h.render({ dismissible:false });
  swipe(tree.props.children[1], 200);
  assert.equal(h.closes, 0); assert.equal(h.back, 0);
});
