import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, modules = {}, globals = {}) {
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  const source = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  vm.runInNewContext(source, {
    ...globals,
    exports,
    require: (n) =>
      n === 'react/jsx-runtime'
        ? { jsx, jsxs: jsx }
        : modules[n] ?? {},
  });
  return exports;
}

test('TenantDropdown renders hidden input for form submission and summary label', () => {
  let stateValue = 'gcash';
  const react = {
    useState: () => [stateValue, (v) => { stateValue = v; }],
    useRef: (init) => ({ current: init }),
    useEffect: () => {},
    useCallback: (fn) => fn,
  };
  const { TenantDropdown } = load(
    'app/components/TenantFormControls.tsx',
    { react, './Icon': { Icon: () => null } }
  );

  const tree = TenantDropdown({
    name: 'method',
    value: 'gcash',
    onChange: () => {},
    options: [
      { value: 'gcash', label: 'GCash' },
      { value: 'bank_transfer', label: 'Bank transfer' },
    ],
  });

  const stringified = JSON.stringify(tree);
  assert.ok(stringified.includes('gcash'), 'Includes value gcash');
  assert.ok(stringified.includes('GCash'), 'Includes label GCash');
  assert.ok(stringified.includes('"name":"method"'), 'Includes hidden input name method');
});

test('TenantFileDropzone renders upload dropzone and accepts file requirements', () => {
  const react = {
    useState: (_init) => [_init, () => {}],
    useRef: () => ({ current: null }),
    useEffect: () => {},
    useCallback: (fn) => fn,
  };
  const { TenantFileDropzone } = load(
    'app/components/TenantFormControls.tsx',
    { react, './Icon': { Icon: () => null } }
  );

  const tree = TenantFileDropzone({
    name: 'file',
    required: true,
    accept: 'image/jpeg,image/png,application/pdf',
    title: 'Choose receipt file',
    subtitle: 'JPG, PNG or PDF up to 2MB',
  });

  const stringified = JSON.stringify(tree);
  assert.ok(stringified.includes('Choose receipt file'), 'Contains dropzone title');
  assert.ok(stringified.includes('JPG, PNG or PDF up to 2MB'), 'Contains dropzone subtitle');
  assert.ok(stringified.includes('"required":true'), 'FileInput is required');
});

test('CalendarDatePicker renders selected date trigger and hidden input for form', () => {
  const react = {
    useState: (_init) => [typeof _init === 'function' ? _init() : _init, () => {}],
    useRef: () => ({ current: null }),
    useEffect: () => {},
    useCallback: (fn) => fn,
  };
  const { CalendarDatePicker } = load(
    'app/components/TenantFormControls.tsx',
    { react, './Icon': { Icon: () => null } }
  );

  const tree = CalendarDatePicker({
    name: 'visit_on',
    value: '2026-11-12',
    onChange: () => {},
    minDate: '2026-11-10',
  });

  const stringified = JSON.stringify(tree);
  assert.ok(stringified.includes('2026-11-12'), 'Hidden input contains YYYY-MM-DD');
  assert.ok(stringified.includes('Nov 12, 2026') || stringified.includes('November 12, 2026'), 'Trigger displays friendly date');
});

test('VisitorFormPreview mounts CalendarDatePicker and time controls', () => {
  const react = {
    useState: (_init) => [typeof _init === 'function' ? _init() : _init, () => {}],
    useRef: () => ({ current: null }),
    useEffect: () => {},
    useCallback: (fn) => fn,
  };
  const { VisitorFormPreview } = load(
    'app/components/VisitorFormPreview.tsx',
    {
      react,
      './ResponsiveOverlay': { ResponsiveOverlay: ({ children, title }) => ({ type: 'dialog', props: { title, children } }) },
      './TenantFormControls': load('app/components/TenantFormControls.tsx', { react, './Icon': { Icon: () => null } }),
    },
    { crypto }
  );

  const tree = VisitorFormPreview({ open: true, onClose: () => {} });
  const stringified = JSON.stringify(tree);
  assert.ok(stringified.includes('Plan a visit'), 'Includes title Plan a visit');
  assert.ok(stringified.includes('visit_on'), 'Includes visit_on calendar field');
  assert.ok(stringified.includes('arrival_time'), 'Includes arrival_time field');
  assert.ok(stringified.includes('departure_time'), 'Includes departure_time field');
});

