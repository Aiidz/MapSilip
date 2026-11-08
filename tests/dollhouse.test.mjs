import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const ts = require('typescript');
for (const extension of ['.ts','.tsx']) require.extensions[extension] = (module, filename) => {
  const output = ts.transpileModule(readFileSync(filename,'utf8'), { compilerOptions: { module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.ReactJSX, target:ts.ScriptTarget.ES2022 } });
  module._compile(output.outputText,filename);
};
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { DollhouseBuilding } = require('../app/components/DollhouseBuilding.tsx');
const { IsometricBuilding } = require('../app/components/IsometricBuilding.tsx');
const room = { id:'persisted-room-id',room_number:'203',floor_label:'2nd Floor',capacity:4,availability:'available' };
const noop = () => {};
const props = { floors:[{label:'2nd Floor',rooms:[room]}], selectedFloor:'2nd Floor', visibleRooms:[room], issues:new Map([[room.id,{status:'pending',openCount:2,totalCount:3,issues:[]}]]),selectedRoomId:room.id,selectedSlotIndex:null,heatmap:true,zoom:1,pan:{x:0,y:0},onSelectFloor:noop,onSelectRoom:noop,onSelectRoomSpace:noop,onPointerDown:noop,onPointerMove:noop,onPointerUp:noop,roofVisible:true,occupancy:new Map([[room.id,1]]) };
const render = (Component, values=props) => renderToStaticMarkup(React.createElement(Component,values));
test('both renderers retain persisted identity, selection and real maintenance count', () => {
  for (const Component of [IsometricBuilding,DollhouseBuilding]) {
    const markup=render(Component);
    assert.match(markup,/data-room-id="persisted-room-id"/);
    assert.match(markup,/Room 203, 2 open maintenance issues/);
    assert.match(markup,/aria-pressed="true"/);
    assert.match(markup,/iso-tile--pending/);
  }
});
test('dollhouse empty geometry creates no selectable invented rooms', () => {
  const markup=render(DollhouseBuilding,{...props,floors:[{label:'2nd Floor',rooms:[]}],visibleRooms:[]});
  assert.doesNotMatch(markup,/data-room-id=/);
  assert.doesNotMatch(markup,/data-room-space=/);
});
test('dollhouse overview floors can be opened by pointer and keyboard without inventing room records', () => {
  const selected = [];
  const tree = DollhouseBuilding({ ...props, selectedFloor: null, onSelectFloor: label => selected.push(label) });
  const controls = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!React.isValidElement(node)) return;
    if (typeof node.type === 'function') return visit(node.type(node.props));
    if (node.props.role === 'button' && node.props['data-floor-label']) controls.push(node);
    visit(node.props.children);
  }
  visit(tree);
  assert.equal(controls.length, 1);
  controls[0].props.onClick();
  controls[0].props.onKeyDown({ key: 'Enter', preventDefault() {} });
  assert.deepEqual(selected, ['2nd Floor', '2nd Floor']);
});
test('roof visibility changes geometry and floor isolation respects the selected floor', () => {
  const shown=render(DollhouseBuilding);
  const hidden=render(DollhouseBuilding,{...props,roofVisible:false});
  assert.ok(shown.length>hidden.length);
  const isolated=render(DollhouseBuilding,{...props,floors:[...props.floors,{label:'3rd Floor',rooms:[]}]});
  assert.match(isolated,/data-dollhouse-floor="2nd Floor"/);
  assert.doesNotMatch(isolated,/data-dollhouse-floor="3rd Floor"/);
});
test('entrance belongs only to the ground level, including when another floor is isolated', () => {
  const floors = [{label:'1st Floor',rooms:[room]}, {label:'2nd Floor',rooms:[]}];
  const all = render(DollhouseBuilding,{...props,floors,selectedFloor:null});
  assert.match(all,/class="dollhouse-entrance"/);
  assert.doesNotMatch(all,/MapSilip · Entrance/);
  const upper = render(DollhouseBuilding,{...props,floors,selectedFloor:'2nd Floor',visibleRooms:[]});
  assert.doesNotMatch(upper,/class="dollhouse-entrance"/);
});
test('2D maintenance uses a translucent room box without count badges; dollhouse also uses boxes', () => {
  const map = render(IsometricBuilding);
  assert.match(map, /iso-heatmap-box--pending/);
  assert.doesNotMatch(map, /class="iso-issue-marker /);
  assert.match(map, /class="iso-selected"/);
  assert.match(map, />203<\/text>/);
  const house = render(DollhouseBuilding);
  assert.match(house, /iso-heatmap-box--pending/);
  assert.doesNotMatch(house, /class="iso-issue-marker /);
});
