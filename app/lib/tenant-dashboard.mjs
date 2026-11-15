export function tenantDashboardDetails(summary, assignment) {
  const roomNumber = assignment.roomNumber ?? summary.room;
  const normalizedRoom = typeof roomNumber === 'string' ? roomNumber.trim().replace(/^room\s+/i, '') : '';

  return {
    ...summary,
    room: normalizedRoom ? `Room ${normalizedRoom}` : null,
    monthly_rent: assignment.monthlyRent ?? null,
  };
}

export function formatTenantMonthlyRent(amount) {
  if (amount === null || amount === undefined || amount === '') return '—';
  const value = Number(amount);
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
}
