export function manilaToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = type => parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function partitionRoomActivity(context, today) {
  const visits = Array.isArray(context.visits) ? context.visits : [];
  const maintenance = Array.isArray(context.maintenance) ? context.maintenance : [];
  const upcomingVisits = visits.filter(row => !row.cancelled_at && row.visit_on >= today)
    .sort((a, b) => a.visit_on.localeCompare(b.visit_on));
  const visitHistory = visits.filter(row => row.cancelled_at || row.visit_on < today)
    .sort((a, b) => b.visit_on.localeCompare(a.visit_on));
  return {
    upcomingVisits,
    visitHistory,
    openMaintenance: maintenance.filter(row => row.status !== 'resolved'),
    maintenanceHistory: maintenance.filter(row => row.status === 'resolved'),
  };
}

export function assignableTenants(profiles, assignments) {
  const assignedTenants = new Set(assignments.filter(row => !row.ended_on).map(row => row.tenant_id));
  return profiles.filter(row => row.status === 'active' && !assignedTenants.has(row.user_id));
}

