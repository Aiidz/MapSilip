import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function componentHarness(file, exportName, { reduced = false, touch = false, nativeTheme = false, deferTheme = false, desktop = true } = {}) {
  const slots = []; let cursor = 0; let effects = []; let dirty = false;
  const queuedThemes = [];
  const themeClasses = new Set();
  const mediaListeners = new Set();
  const fetches = [];
  let finishFallback;
  const fallbackFinished = new Promise(resolve => { finishFallback = resolve; });
  const animations = []; let cancellations = 0; let stateUpdates = 0; let timers = 0; let themeTransitions = 0;
  const node = { animate(keyframes, options) { animations.push({ keyframes, options }); return { cancel() { cancellations++; } }; } };
  const react = {
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useState(initial) { const index = cursor++; slots[index] ??= { value: initial }; return [slots[index].value, value => { slots[index].value = value; dirty = true; stateUpdates++; }]; },
    useLayoutEffect(effect, deps) {
      const index = cursor++; const old = slots[index];
      if (!old || deps.some((value, i) => value !== old.deps[i])) effects.push(() => { old?.cleanup?.(); slots[index] = { deps, cleanup: effect() }; });
    },
  };
  react.useEffect = react.useLayoutEffect;
  const document = { documentElement: { dataset: {}, classList: { add(name) { themeClasses.add(name); }, remove(name) { themeClasses.delete(name); } }, getAnimations() { return [{ finished: fallbackFinished }]; } }, ...(nativeTheme ? { startViewTransition(update) { themeTransitions++; if (deferTheme) queuedThemes.push(update); else update(); return { finished: fallbackFinished }; } } : {}) };
  const window = { matchMedia(query) { return { addEventListener(_, fn) { mediaListeners.add(fn); }, removeEventListener(_, fn) { mediaListeners.delete(fn); }, get matches() { return query.includes('reduced-motion') ? reduced : query.includes('min-width') ? desktop : query.includes('hover') ? !touch : false; } }; }, addEventListener() {}, removeEventListener() {}, setTimeout() { timers++; } };
  const jsx = (type, props, key) => ({ type, props, key });
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8') + `\nexport { ${exportName} as Subject };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, document, window, AbortController, fetch(url) { fetches.push(url); return Promise.resolve({ ok: true, json: async () => ({ display_name: 'Test Staff' }) }); }, require(name) { return name === 'react' ? react : name === 'react/jsx-runtime' ? { jsx, jsxs: jsx } : name === 'next/navigation' ? { usePathname: () => '/management' } : name.includes('navigation.mjs') ? { profilePathForArea: area => '/'+area+'/profile' } : {}; } });
  return {
    render(props = {}) { let tree; let renders = 0; do { dirty = false; cursor = 0; effects = []; tree = exports.Subject(props); if (tree.props.ref) tree.props.ref.current = node; effects.forEach(effect => effect()); if (++renders > 5) throw Error('Repeated rendering'); } while (dirty); return tree; },
    animations, document, themeClasses, fetches, finishFallback() { finishFallback(); }, setDesktop(value) { desktop = value; mediaListeners.forEach(fn => fn()); }, flushThemeTransitions() { queuedThemes.splice(0).forEach(update => update()); }, get cancellations() { return cancellations; }, get stateUpdates() { return stateUpdates; }, get timers() { return timers; }, get themeTransitions() { return themeTransitions; },
  };
}

test('page motion preserves child identity and never requests an extra render on navigation', () => {
  const h = componentHarness('app/components/AppShell.tsx', 'PortalPageContent');
  const child = { type: 'page' };
  const initial = h.render({ pathname: '/management', children: child });
  const next = h.render({ pathname: '/management/rooms', children: child });
  assert.equal(next.key, initial.key, 'the page must not remount just to animate');
  assert.equal(next.props.children, child);
  assert.equal(h.stateUpdates, 0);
  assert.equal(h.animations.length, 1);
  h.render({ pathname: '/management/rooms', children: { type: 'loaded-data' } });
  assert.equal(h.animations.length, 1, 'data updates must not restart the page entrance');
  h.render({ pathname: '/management/maintenance', children: child });
  assert.equal(h.cancellations, 1, 'superseded motion must be cancelled');
});

test('reduced-motion navigation displays content without starting an animation', () => {
  const h = componentHarness('app/components/AppShell.tsx', 'PortalPageContent', { reduced: true });
  h.render({ pathname: '/tenant', children: 'first' });
  assert.equal(h.render({ pathname: '/tenant/details', children: 'ready' }).props.children, 'ready');
  assert.equal(h.animations.length, 0);
  assert.equal(h.stateUpdates, 0);
});

for (const mode of [{ reduced: true }, { reduced: true, nativeTheme: true }]) {
  test(`theme update is immediate without a timer or viewport animation: ${JSON.stringify(mode)}`, () => {
    const h = componentHarness('app/components/ThemeToggle.tsx', 'ThemeToggle', mode);
    h.render().props.onClick();
    assert.equal(h.document.documentElement.dataset.theme, 'dark');
    assert.equal(h.themeTransitions, 0);
    assert.equal(h.timers, 0);
  });
}
test('capable desktop theme transition applies the new theme through the browser', () => {
  const h = componentHarness('app/components/ThemeToggle.tsx', 'ThemeToggle', { nativeTheme: true });
  h.render().props.onClick();
  assert.equal(h.themeTransitions, 1);
  assert.equal(h.document.documentElement.dataset.theme, 'dark');
});

test('rapid desktop theme clicks apply in order even while snapshots are pending', () => {
  const h = componentHarness('app/components/ThemeToggle.tsx', 'ThemeToggle', { nativeTheme: true, deferTheme: true });
  h.document.documentElement.dataset.theme = 'light';
  const button = h.render();
  button.props.onClick(); button.props.onClick();
  h.flushThemeTransitions();
  assert.equal(h.document.documentElement.dataset.theme, 'light');
});

test('touch devices restore native theme crossfades without timers or per-frame React updates', () => {
  const h = componentHarness('app/components/ThemeToggle.tsx', 'ThemeToggle', { touch: true, nativeTheme: true });
  h.render().props.onClick();
  assert.equal(h.themeTransitions, 1);
  assert.equal(h.timers, 0);
  assert.equal(h.stateUpdates, 0);
});

test('unsupported browsers keep fallback color transitions until they finish', async () => {
  const h = componentHarness('app/components/ThemeToggle.tsx', 'ThemeToggle');
  h.render().props.onClick();
  assert.equal(h.document.documentElement.dataset.theme, 'dark');
  assert.ok(h.themeClasses.has('theme-color-transition'));
  h.finishFallback();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.themeClasses.size, 0);
  assert.equal(h.timers, 0);
});

test('desktop-only sidebar profile does not fetch on phones and loads once after widening', () => {
  const h = componentHarness('app/components/SidebarProfileCard.tsx', 'SidebarProfileCard', { desktop: false });
  h.render({ area: 'management' });
  assert.equal(h.fetches.length, 0, 'hidden desktop card must not query the backend');
  h.setDesktop(true);
  h.render({ area: 'management' });
  assert.deepEqual(h.fetches, ['/api/profile']);
  h.render({ area: 'management' });
  assert.equal(h.fetches.length, 1, 'ordinary renders must not reload the profile');
});

test('native theme snapshots avoid background color tweens and release their temporary class', async () => {
  const h = componentHarness('app/components/ThemeToggle.tsx', 'ThemeToggle', { nativeTheme:true });
  h.render().props.onClick();
  assert.ok(h.themeClasses.has('theme-snapshot-transition'));
  h.finishFallback();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.themeClasses.size,0);
});
