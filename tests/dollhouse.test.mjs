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
const room = { id:'persisted-room-id',room_number:'3',floor_label:'2nd Floor',capacity:4,availability:'available' };
const noop = () => {};
const props = { floors:[{label:'2nd Floor',rooms:[room]}], selectedFloor:'2nd Floor', visibleRooms:[room], issues:new Map([[room.id,{status:'pending',openCount:2,totalCount:3,issues:[]}]]),selectedRoomId:room.id,selectedSlotIndex:null,heatmap:true,zoom:1,pan:{x:0,y:0},onSelectFloor:noop,onSelectRoom:noop,onSelectRoomSpace:noop,onPointerDown:noop,onPointerMove:noop,onPointerUp:noop,roofVisible:true,occupancy:new Map([[room.id,1]]) };
const render = (Component, values=props) => renderToStaticMarkup(React.createElement(Component,values));
test('both renderers retain persisted identity, selection and real maintenance count', () => {
  for (const Component of [IsometricBuilding,DollhouseBuilding]) {
    const markup=render(Component);
    assert.match(markup,/data-room-id="persisted-room-id"/);
    assert.match(markup,/Room 3, available, 2 open maintenance issues/);
    assert.match(markup,/aria-pressed="true"/);
    assert.match(markup,/dorm-room--pending/);
  }
});
test('dollhouse empty geometry creates no selectable invented rooms', () => {
  const markup=render(DollhouseBuilding,{...props,floors:[{label:'2nd Floor',rooms:[]}],visibleRooms:[]});
  assert.doesNotMatch(markup,/data-room-id=/);
  assert.equal((markup.match(/no linked record/g) ?? []).length, 19);
});
test('overview floor controls expose keyboard semantics without invented records', () => {
  const markup = render(DollhouseBuilding, { ...props, selectedFloor: null });
  assert.match(markup, /data-floor-label="2nd Floor" role="button" tabindex="0"/);
  assert.match(markup, /aria-label="Inspect 2nd Floor"/);
  assert.doesNotMatch(markup, /aria-label="Inspect 1st Floor"/);
  assert.doesNotMatch(markup, /class="dorm-room-label"/);
  assert.doesNotMatch(markup, /class="dorm-badge"/);
  assert.match(markup, /aria-label="First floor businesses, exterior only"/);
});
test('floor plaques stay in the building overview and disappear from an isolated floor view', () => {
  const overview = render(DollhouseBuilding, { ...props, selectedFloor: null });
  const floorView = render(DollhouseBuilding, { ...props, selectedFloor: '2nd Floor' });
  assert.match(overview, /aria-label="Inspect 2nd Floor"/);
  assert.doesNotMatch(floorView, /class="dollhouse-floor-control"/);
});
test('roof visibility changes geometry and floor isolation respects the selected floor', () => {
  const shown=render(DollhouseBuilding);
  const hidden=render(DollhouseBuilding,{...props,roofVisible:false});
  assert.ok(shown.length>hidden.length);
  const overview=render(DollhouseBuilding,{...props,selectedFloor:null});
  assert.match(overview,/data-dollhouse-roof="true"/);
  assert.doesNotMatch(shown,/data-dollhouse-roof="true"/);
  const isolated=render(DollhouseBuilding,{...props,floors:[...props.floors,{label:'3rd Floor',rooms:[]}]});
  assert.match(isolated,/data-dollhouse-floor="2nd Floor"/);
  assert.match(isolated,/data-dollhouse-floor="3rd Floor"/);
  assert.match(isolated,/data-dollhouse-floor="2nd Floor" data-selected="true"/);
});
test('room entrances have door panels and the third-floor outer walls reach full height', () => {
  const markup=render(DollhouseBuilding,{...props,selectedFloor:'3rd Floor'});
  assert.ok((markup.match(/class="dorm-door"/g) ?? []).length >= 19);
  assert.match(markup,/<g class="dorm-room[^>]*data-room-space="6"[^>]*data-right-wall-height="40"/);
  assert.match(markup,/<g class="dorm-room[^>]*data-room-space="9"[^>]*data-right-wall-height="40"/);
});
test('assembled view raises room walls and closes the exposed building and roof sides only there', () => {
  const overview=render(DollhouseBuilding,{...props,selectedFloor:null});
  const floor=render(DollhouseBuilding,{...props,selectedFloor:'3rd Floor'});
  assert.match(overview,/<g class="dorm-room[^>]*data-room-space="6"[^>]*data-right-wall-height="175"/);
  assert.match(floor,/<g class="dorm-room[^>]*data-room-space="6"[^>]*data-right-wall-height="40"/);
  assert.equal((overview.match(/data-dollhouse-side-wall=/g) ?? []).length,2);
  assert.match(overview,/data-roof-side-wall="true"/);
  assert.doesNotMatch(floor,/data-dollhouse-side-wall=|data-roof-side-wall=/);
});
test('the photo-based stair annex is exterior-only and appears only in the assembled view', () => {
  const overview=render(DollhouseBuilding,{...props,selectedFloor:null});
  const floor=render(DollhouseBuilding,{...props,selectedFloor:'3rd Floor'});
  assert.match(overview,/data-stair-annex="true"/);
  assert.doesNotMatch(floor,/data-stair-annex=/);
  assert.match(overview,/data-stair-annex="true" aria-hidden="true" pointer-events="none"/);
});
test('unconfirmed floors do not fabricate a surveyed layout or business rooms', () => {
  const markup = render(DollhouseBuilding, { ...props, floors: [{label:'1st Floor',rooms:[room]}], selectedFloor: '1st Floor' });
  assert.match(markup, /First floor businesses, exterior only/);
  assert.doesNotMatch(markup, /data-room-id=/);
});
test('maintenance, occupancy and selection stay bound to the same numbered room in both views', () => {
  for (const Component of [IsometricBuilding,DollhouseBuilding]) {
    const markup=render(Component);
    assert.match(markup, /dorm-room--pending/);
    assert.match(markup, /dorm-room-outline is-selected/);
    assert.match(markup, />Room 3<\/text>/);
    assert.match(markup, />2<\/text>/);
    const occupied=render(Component, {...props, heatmap:false});
    assert.match(occupied, />1\/4<\/text>/);
  }
});
test('second floor has nine rooms, third has ten, and kitchen-side rooms stay bed-free', () => {
  const markup=render(DollhouseBuilding);
  assert.equal((markup.match(/class="dorm-room dorm-room--/g) ?? []).length,19);
  assert.equal((markup.match(/data-furniture="bed"/g) ?? []).length,13);
  assert.equal((markup.match(/data-furniture="kitchen-side-room"/g) ?? []).length,6);
  assert.match(markup,/Outdoor shared kitchen/);
  assert.doesNotMatch(markup,/>CR<\/text>|>Hallway<\/text>|>Stairs<\/text>/);
});

test('inspection keeps all levels mounted and uses only transforms and opacity', () => {
  for (const selectedFloor of [null, '1st Floor', '2nd Floor', '3rd Floor']) {
    const markup=render(DollhouseBuilding,{...props,selectedFloor});
    assert.equal((markup.match(/data-dollhouse-floor=/g) ?? []).length,3);
    assert.equal((markup.match(/class="dollhouse-business"/g) ?? []).length,1);
    assert.equal((markup.match(/data-room-id="persisted-room-id"/g) ?? []).length,1);
    if(selectedFloor) assert.match(markup,/opacity:0;pointer-events:none/);
  }
});

test('maintenance glow follows real issue states and excludes clear or unlinked rooms', () => {
  const working={...room,id:'working-room',room_number:'4'};
  const clear={...room,id:'clear-room',room_number:'2'};
  const issues=new Map([...props.issues,['working-room',{status:'in_progress',openCount:1,totalCount:1,issues:[]}],['clear-room',{status:'clear',openCount:0,totalCount:1,issues:[]}]]);
  const values={...props,floors:[{label:'2nd Floor',rooms:[room,working,clear]}],issues};
  const markup=render(DollhouseBuilding,values);
  assert.match(markup,/maintenance-glow--pending is-active/);
  assert.match(markup,/maintenance-glow--in_progress/);
  assert.match(markup,/data-maintenance-room="persisted-room-id"/);
  assert.match(markup,/data-maintenance-room="working-room"/);
  assert.doesNotMatch(markup,/data-maintenance-room="clear-room"/);
  assert.doesNotMatch(render(DollhouseBuilding,{...values,heatmap:false}),/data-maintenance-room=/);
});
test('overview glow identifies its floor and cannot make rooms keyboard selectable', () => {
  const markup=render(DollhouseBuilding,{...props,selectedFloor:null});
  assert.match(markup,/data-glow-floor="2nd Floor" data-floor-label="2nd Floor"/);
  assert.doesNotMatch(markup,/<g class="dorm-room[^>]*role="button"/);
});

test('overview square and rectangular windows sit on the visible corridor facade', () => {
  const { poly } = require('../app/components/IsometricBuilding.tsx');
  const { roomLayoutForFloor } = require('../app/lib/building-map.mjs');
  const markup = render(DollhouseBuilding, { ...props, selectedFloor: null });
  for (const label of ['2nd Floor', '3rd Floor']) {
    for (const { x, y } of roomLayoutForFloor(label)) {
      for (const [a, b, bottom, top] of [[.12,.34,98,125],[.99,1.3,42,125]]) {
        const points = poly([[x+a,y+1.2,bottom],[x+b,y+1.2,bottom],[x+b,y+1.2,top],[x+a,y+1.2,top]]);
        assert.ok(markup.includes(`points="${points}" fill="#182e3e"`), `${label}: missing front window at ${x}, ${y}`);
      }
    }
  }
});
