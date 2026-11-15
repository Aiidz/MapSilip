import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewRoomOptions } from '../app/lib/access-review.mjs';
const room = (id, extra = {}) => ({ id, room_number: id, floor_label: '2nd Floor', capacity: 3, availability: 'available', gender_policy: 'any', monthly_rent: 2500, ...extra });
test('room review respects active occupancy, gender, availability and numeric room ordering', () => {
  const rooms = [room('10'), room('2', { gender_policy: 'female' }), room('1', { gender_policy: 'male', capacity: 1 }), room('3', { availability: 'maintenance' })];
  const choices = reviewRoomOptions(rooms, [{ room_id: '1', ended_on: null }, { room_id: '2', ended_on: '2026-01-01' }], 'female');
  assert.deepEqual(choices.map(row => row.id), ['1', '2', '3', '10']);
  assert.equal(choices[0].reason, 'Full');
  assert.equal(choices[1].eligible, true);
  assert.equal(choices[1].vacancies, 3);
  assert.equal(choices[2].eligible, false);
  assert.equal(choices[3].monthly_rent, 2500);
  assert.equal(rooms[0].id, '10');
});
test('unknown gender cannot be assigned a restricted room and overcapacity never produces negative vacancies', () => {
  const [restricted, full] = reviewRoomOptions([room('1', { gender_policy: 'male' }), room('2', { capacity: 1 })], [{ room_id: '2' }, { room_id: '2' }]);
  assert.equal(restricted.eligible, false);
  assert.equal(restricted.reason, 'Boys only');
  assert.equal(full.vacancies, 0);
  assert.equal(full.eligible, false);
});
