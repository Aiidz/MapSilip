import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assignableTenants, partitionRoomActivity } from '../app/lib/room-context.mjs';

test('assignment picker includes only active tenants with no current room assignment', () => {
  const profiles = [
    { user_id: 'free', status: 'active' },
    { user_id: 'moving', status: 'active' },
    { user_id: 'same-room', status: 'active' },
    { user_id: 'inactive', status: 'inactive' },
    { user_id: 'previously-assigned', status: 'active' },
  ];
  const assignments = [
    { tenant_id: 'moving', room_id: 'room-b', ended_on: null },
    { tenant_id: 'same-room', room_id: 'room-a', ended_on: null },
    { tenant_id: 'inactive', room_id: 'room-b', ended_on: null },
    { tenant_id: 'previously-assigned', room_id: 'room-b', ended_on: '2026-10-01' },
  ];
  assert.deepEqual(assignableTenants(profiles, assignments).map(row => row.user_id), ['free', 'previously-assigned']);
});

test('room context leads with upcoming visits and open repairs while preserving history', () => {
  const context = {
    visits: [
      { id: 'past', visit_on: '2026-10-27', cancelled_at: null },
      { id: 'today', visit_on: '2026-10-29', cancelled_at: null },
      { id: 'future', visit_on: '2026-11-01', cancelled_at: null },
      { id: 'cancelled', visit_on: '2026-11-02', cancelled_at: '2026-10-28T00:00:00Z' },
    ],
    maintenance: [
      { id: 'open', status: 'pending' },
      { id: 'working', status: 'in_progress' },
      { id: 'done', status: 'resolved' },
    ],
  };
  const result = partitionRoomActivity(context, '2026-10-29');
  assert.deepEqual(result.upcomingVisits.map(row => row.id), ['today', 'future']);
  assert.deepEqual(result.visitHistory.map(row => row.id), ['cancelled', 'past']);
  assert.deepEqual(result.openMaintenance.map(row => row.id), ['open', 'working']);
  assert.deepEqual(result.maintenanceHistory.map(row => row.id), ['done']);
});

test('room context stays behind verified staff sessions and database role checks', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261029120000_room_context.sql', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../app/api/rooms/context/route.ts', import.meta.url), 'utf8');
  assert.match(sql, /mapsilip_private\.can_read\('tenant\.application\.approve'\)/);
  assert.match(sql, /mapsilip_private\.can_read\('staff\.access\.inspect'\)/);
  assert.match(sql, /viewer_role not in \('owner', 'caretaker'\)/);
  assert.match(sql, /grant execute on function public\.mapsilip_room_context\(uuid\) to authenticated/);
  assert.match(sql, /if viewer_role = 'owner' then/);
  assert.match(sql, /emergency_contact/);
  assert.match(sql, /v\.visit_on >= a\.started_on/);
  assert.match(sql, /v\.visit_on <= a\.ended_on/);
  assert.match(sql, /where v\.cancelled_at is null and v\.visit_on >= local_today/);
  assert.match(sql, /revoke all on function public\.mapsilip_room_context\(uuid\)\s+from public, anon, authenticated, service_role/);
  assert.match(route, /verifyAuthSession/);
  assert.match(route, /client\.rpc\('mapsilip_room_context'/);
});
