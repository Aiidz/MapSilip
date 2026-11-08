import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const source = path => {
  const url = new URL(path, import.meta.url);
  return existsSync(url) ? readFileSync(url, 'utf8') : '';
};
const sql = source('../supabase/migrations/20261029130000_tenant_directory.sql');
const route = source('../app/api/tenants/directory/route.ts');
const operations = readFileSync(new URL('../app/api/operations/route.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/components/OperationalWorkspace.tsx', import.meta.url), 'utf8');
const roomManagement = readFileSync(new URL('../app/components/RoomManagementWorkspace.tsx', import.meta.url), 'utf8');

test('tenant directory is owner-only and sorts unassigned residents before pagination', () => {
  assert.match(sql, /can_read\('tenant\.application\.approve'\)/);
  assert.match(sql, /case when current_assignment\.room_id is null then 0 else 1 end/);
  assert.match(sql, /offset \(p_page - 1\) \* p_page_size limit p_page_size/);
  assert.match(sql, /revoke all on function public\.mapsilip_tenant_directory/);
  assert.match(route, /verifyAuthSession/);
});

test('deactivation preserves identity and history while ending the active assignment', () => {
  assert.match(sql, /select p\.\* into target_profile.*for update/s);
  assert.match(sql, /update public\.tenant_profiles set status = 'inactive'/);
  assert.match(sql, /update public\.room_assignments set ended_on/);
  assert.match(sql, /where tenant_id = p_tenant_id and ended_on is null/);
  assert.doesNotMatch(sql, /delete\s+from\s+(auth\.users|public\.tenant_profiles)/i);
  assert.match(route, /assertRequestOrigin/);
});

test('tenant cards open a dialog with assigned-room and account controls', () => {
  assert.match(page, /tenant-directory__card/);
  assert.match(page, /showModal\(\)/);
  assert.match(page, /Deactivate tenant/);
  assert.match(page, /room\.assign/);
});

test('room tenant details load payment and concern history scoped to the selected tenant', () => {
  assert.match(operations, /tenantId/);
  assert.match(operations, /\['payments',\s*'concerns'\]/);
  assert.match(operations, /query\.eq\('tenant_id',\s*tenantId\)/);
  assert.match(roomManagement, /tenantId=\$\{encodeURIComponent\(tenantId\)\}/);
  assert.match(roomManagement, /Personal Information/);
  assert.match(roomManagement, /Payment History/);
  assert.match(roomManagement, /Concerns &amp; Suggestions/);
  assert.match(roomManagement, /Slot \$\{slotOf\(row\.user_id\)\}/);
  assert.match(roomManagement, /filter==='rooms' \? row\.room_number : row\.display_name/);
  assert.doesNotMatch(roomManagement, /Room \$\{value\(roomOf\(row\.user_id\)\?\.room_number\)\}/);
  assert.match(roomManagement, /if \(filter==='rooms'\).*setFilter\('all'\).*setView\('tenants'\)/);
});

test('payment search matches reference numbers and tenant names', () => {
  const paymentWorkspace = readFileSync(new URL('../app/components/ManagementPaymentsWorkspace.tsx', import.meta.url), 'utf8');
  const paymentsPage = readFileSync(new URL('../app/management/payments/page.tsx', import.meta.url), 'utf8');
  assert.match(operations, /kind === 'payments'[\s\S]*tenant_profiles[\s\S]*display_name[\s\S]*tenant_id\.in/);
  assert.match(paymentWorkspace, /aria-label="Search payment reference or tenant name"/);
  assert.match(roomManagement, /href=\{`\/management\/payments\?search=\$\{encodeURIComponent\(String\(selected\.display_name \?\? ''\)\)\}`\}/);
  assert.match(paymentsPage, /searchParams: Promise/);
  assert.match(paymentWorkspace, /useState\(initialSearch\)/);
});
