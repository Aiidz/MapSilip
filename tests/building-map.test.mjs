import test from 'node:test';
import assert from 'node:assert/strict';
import { groupRoomsByFloor, modelFloors, modelRoomLabel, pageRooms, ROOMS_PER_SCENE, summarizeRoomIssues } from '../app/lib/building-map.mjs';

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

test('the three-floor model remains navigable while room records are added', () => {
  const display = modelFloors([]);
  assert.equal(display.length, 3);
  assert.equal(ROOMS_PER_SCENE, 8);
  assert.equal(display.length * ROOMS_PER_SCENE, 24);
  assert.equal(modelRoomLabel(0), '01');
  assert.equal(modelRoomLabel(7), '08');
  assert.deepEqual(display.map(floor => floor.label), ['1st Floor', '2nd Floor', '3rd Floor']);
  assert.ok(display.every(floor => floor.rooms.length === 0));
  const live = [{ label: 'Ground Floor', rooms: [{ id: 'real' }] }];
  assert.deepEqual(modelFloors(live).map(floor => floor.label), ['1st Floor', '2nd Floor', '3rd Floor', 'Ground Floor']);
  assert.equal(modelFloors([{ label: '2nd Floor', rooms: [{ id: 'real' }] }])[1].rooms[0].id, 'real');
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
