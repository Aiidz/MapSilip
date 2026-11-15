import test from 'node:test';
import assert from 'node:assert/strict';
import { groupRoomsByFloor, modelFloors, modelRoomLabel, pageRooms, ROOMS_PER_SCENE, summarizeRoomIssues, ROOM_LAYOUT, roomLayoutForFloor, mapRoomSlots, roomSlotIndex, roomDisplayNumber, dollhouseLevelOffsets } from '../app/lib/building-map.mjs';

test('floor and page mapping uses only persisted room identities', () => {
  const rooms = [
    { id: 'b', room_number: '201', floor_label: '2nd Floor' },
    { id: 'a', room_number: '101', floor_label: '1st Floor' },
    { id: 'c', room_number: '102', floor_label: '1st Floor' },
  ];
  const floors = groupRoomsByFloor(rooms);
  assert.deepEqual(floors.map(floor => floor.label), ['1st Floor', '2nd Floor']);
  assert.deepEqual(floors[0].rooms.map(room => room.id), ['a', 'c']);
  assert.deepEqual(pageRooms(floors[0].rooms, 1, 1).map(room => room.id), ['a']);
  assert.deepEqual(pageRooms(floors[0].rooms, 2, 1).map(room => room.id), ['c']);
  assert.deepEqual(groupRoomsByFloor([]), []);
});

test('the confirmed two-floor model remains navigable while room records are added', () => {
  const display = modelFloors([]);
  assert.equal(display.length, 2);
  assert.equal(ROOMS_PER_SCENE, 9);
  assert.equal(display.length * ROOMS_PER_SCENE, 18);
  assert.equal(modelRoomLabel(0), '01');
  assert.equal(modelRoomLabel(7), '08');
  assert.deepEqual(display.map(floor => floor.label), ['2nd Floor', '3rd Floor']);
  assert.ok(display.every(floor => floor.rooms.length === 0));
  const live = [{ label: 'Ground Floor', rooms: [{ id: 'real' }] }];
  assert.deepEqual(modelFloors(live).map(floor => floor.label), ['2nd Floor', '3rd Floor', 'Ground Floor']);
  assert.equal(modelFloors([{ label: '2nd Floor', rooms: [{ id: 'real' }] }])[0].rooms[0].id, 'real');
});

test('maintenance cue is derived from real room-linked issues without inventing priority', () => {
  const issues = [
    { id: '1', room_id: 'a', status: 'resolved' },
    { id: '2', room_id: 'a', status: 'in_progress' },
    { id: '3', room_id: 'a', status: 'pending' },
    { id: '4', room_id: 'b', status: 'resolved' },
    { id: '5', room_id: 'missing', status: 'pending' },
  ];
  const state = summarizeRoomIssues([{ id: 'a' }, { id: 'b' }], issues);
  assert.deepEqual(state.get('a'), { status: 'pending', openCount: 2, totalCount: 3, issues: issues.slice(0, 3) });
  assert.deepEqual(state.get('b'), { status: 'clear', openCount: 0, totalCount: 1, issues: [issues[3]] });
  assert.equal(state.has('missing'), false);
  assert.deepEqual(summarizeRoomIssues([{ id: 'a' }], []).get('a'), {
    status: 'clear', openCount: 0, totalCount: 0, issues: [],
  });
});

test('pending takes priority regardless of issue order; in progress remains yellow when alone', () => {
  const rooms = [{ id: 'pending-room' }, { id: 'working-room' }];
  const issues = [
    { id: 'p', room_id: 'pending-room', status: 'pending' },
    { id: 'w', room_id: 'pending-room', status: 'in_progress' },
    { id: 'w2', room_id: 'working-room', status: 'in_progress' },
    { id: 'r', room_id: 'working-room', status: 'resolved' },
  ];
  for (const rows of [issues, [...issues].reverse()]) {
    const state = summarizeRoomIssues(rooms, rows);
    assert.equal(state.get('pending-room').status, 'pending');
    assert.equal(state.get('working-room').status, 'in_progress');
  }
});

test('nine physical rooms preserve numbering, doors and kitchen-side bed exclusion', () => {
  assert.equal(ROOM_LAYOUT.length, 9);
  assert.ok(ROOM_LAYOUT.slice(0, 4).every((slot, i, slots) => slot.y === 2.5 && (!i || slot.x < slots[i - 1].x)));
  assert.deepEqual(ROOM_LAYOUT.map(slot => slot.door), ['front','front','front','front','left','left','right','right','front']);
  assert.ok(ROOM_LAYOUT.slice(6).every(slot => !slot.beds));
  assert.ok(ROOM_LAYOUT.slice(0, 6).every(slot => slot.beds));
});
test('sparse, reordered and ambiguous records never shift physical room identities', () => {
  const first = { id: 'a', room_number: 'Room 01' };
  const ninth = { id: 'b', room_number: '9' };
  const slots = mapRoomSlots([ninth, first, { id: 'unknown', room_number: '201' }]);
  assert.equal(slots[0], first);
  assert.equal(slots[8], ninth);
  assert.equal(slots[1], undefined);
  assert.equal(roomSlotIndex({ room_number: '201' }), -1);
  assert.equal(mapRoomSlots([first, { id: 'duplicate', room_number: '1' }])[0], undefined);
  assert.equal(pageRooms(Array.from({length: 9}, (_, i) => i), 1).length, 9);
});
test('third-floor numbering continues 10–19 while preserving older linked room identities', () => {
  const third = roomLayoutForFloor('3rd Floor');
  assert.deepEqual(third.map((_, index) => roomDisplayNumber('3rd Floor', index)), [10,11,12,13,14,15,16,17,18,19]);
  assert.equal(third.filter(slot => slot.y === 2.5 && slot.beds).length, 5);
  assert.deepEqual(third.slice(0, 5).map(slot => slot.x), [7.54,6.38,5.22,4.06,2.9]);
  assert.ok(third.slice(0, 5).every(slot => slot.width === 1.16 && slot.x + slot.width <= 8.7 + 1e-9));
  assert.equal(ROOM_LAYOUT[0].x + 1.4, 8.65);
  assert.equal(roomLayoutForFloor('2nd Floor').length, 9);
  assert.equal(roomDisplayNumber('2nd Floor', 0), 1);
  assert.equal(roomSlotIndex({ room_number: '18', floor_label: '3rd Floor' }), 8);
  assert.equal(roomSlotIndex({ room_number: '19', floor_label: '3rd Floor' }), 9);
  assert.equal(roomSlotIndex({ room_number: '9', floor_label: '3rd Floor' }), 8);
  assert.equal(roomSlotIndex({ room_number: '18', floor_label: '2nd Floor' }), -1);
  assert.equal(roomSlotIndex({ room_number: '201', floor_label: '2nd Floor' }), 0);
  assert.equal(roomSlotIndex({ room_number: '308', floor_label: '3rd Floor' }), 7);
  assert.equal(roomSlotIndex({ room_number: '101', floor_label: '1st Floor' }), -1);
  assert.equal(mapRoomSlots([{ id:'new', room_number:'10', floor_label:'3rd Floor' }])[0].id,'new');
  assert.equal(mapRoomSlots([], '3rd Floor').length, 10);
});

test('assembled floor order and exploded inspection clearances are deterministic', () => {
  assert.deepEqual(dollhouseLevelOffsets(null),[140,140,10]);
  for(const [selected,label] of ['1st Floor','2nd Floor','3rd Floor'].entries()) {
    const positions=dollhouseLevelOffsets(label);
    assert.equal(positions[selected],-380);
    assert.equal(new Set(positions).size,3);
    assert.deepEqual([...positions].sort((a,b)=>a-b),[-380,40,390]);
  }
  assert.deepEqual(dollhouseLevelOffsets('unknown'),dollhouseLevelOffsets(null));
});
