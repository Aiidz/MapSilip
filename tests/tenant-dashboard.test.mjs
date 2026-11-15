import test from 'node:test';
import assert from 'node:assert/strict';
import { tenantDashboardDetails, formatTenantMonthlyRent } from '../app/lib/tenant-dashboard.mjs';

test('tenant home shows the assigned room and configured rent without a future invoice', () => {
  const dashboard = tenantDashboardDetails(
    { room: '1', next_invoice: null },
    { roomNumber: '1', monthlyRent: 3000 },
  );

  assert.equal(dashboard.room, 'Room 1');
  assert.equal(formatTenantMonthlyRent(dashboard.monthly_rent), '₱3,000.00');
});

test('tenant home keeps honest empty values when no room or rent is assigned', () => {
  const dashboard = tenantDashboardDetails(
    { room: null, next_invoice: null },
    { roomNumber: undefined, monthlyRent: null },
  );

  assert.equal(dashboard.room, null);
  assert.equal(formatTenantMonthlyRent(dashboard.monthly_rent), '—');
});
