'use client';

import { useEffect, useState } from 'react';
import { manilaToday } from '../lib/room-context.mjs';
import { fetchOperationRows } from '../lib/workspace-loading';
import { MetricDetails, type Metric } from './MetricDetails';

type Row = Record<string, unknown>;

export function contractMetrics(assignments: Row[], tenants: Row[], rooms: Row[], today = manilaToday()) {
  const [year, month] = today.split('-').map(Number);
  const windowEnd = new Date(Date.UTC(year, month + 1, 1)).toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);
  const activeTenantIds = new Set(tenants.filter(tenant => tenant.status === 'active').map(tenant => tenant.user_id));
  const currentAssignments = assignments.filter(row => !row.ended_on && row.contract_end_on && activeTenantIds.has(row.tenant_id));
  const names = new Map(tenants.map(tenant => [tenant.user_id, String(tenant.display_name)]));
  const roomNames = new Map(rooms.map(room => [room.id, String(room.room_number)]));
  const active = currentAssignments.filter(row => String(row.started_on) <= today && String(row.contract_end_on) >= today);
  const upcoming = currentAssignments.filter(row =>
    String(row.contract_end_on) >= today && String(row.contract_end_on) < windowEnd)
    .sort((a, b) => String(a.contract_end_on).localeCompare(String(b.contract_end_on)));
  const newContracts = assignments.filter(row => row.contract_end_on && String(row.started_on).startsWith(thisMonth) && String(row.started_on) <= today);
  function metric(title: string, note: string, rows: Row[]): Metric {
    return { title, note, value: rows.length, columns: ['Tenant', 'Room', 'Start date', 'End date'], records: rows.map(row => ({
      id: String(row.id), tenantId: typeof row.tenant_id === 'string' ? row.tenant_id : undefined,
      cells: [names.get(row.tenant_id) ?? 'Tenant', roomNames.get(row.room_id) ?? '—', String(row.started_on), String(row.contract_end_on)],
      href: '/management/rooms?tenant=' + encodeURIComponent(String(row.tenant_id)),
    })) };
  }

  return {
    expiring: metric('Contracts Ending Soon', 'Ending this month or next', upcoming),
    overview: [
      metric('Active Contracts', 'Current dated contracts', active),
      metric('Expiring Soon', 'Ending this month or next', upcoming),
      { ...metric('Renewed', 'Renewal tracking is unavailable', []), value: '—' },
      metric('New Contracts', 'Started this month', newContracts),
    ],
  };
}

export function ContractOverview() {
  const [metrics, setMetrics] = useState<Metric[]>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    Promise.all([
      fetchOperationRows('assignments', signal),
      fetchOperationRows('tenants', signal),
      fetchOperationRows('rooms', signal),
    ]).then(([assignments, tenants, rooms]) => {
      if (!signal.aborted) setMetrics(contractMetrics(assignments, tenants, rooms).overview);
    }).catch(() => { if (!signal.aborted) setError(true); });
    return () => controller.abort();
  }, [attempt]);
  return <section className="owner-insights" aria-labelledby="contract-overview-title">
    <h2 id="contract-overview-title">Contract overview</h2>
    {error ? <p role="alert">Contracts could not be loaded. <button type="button" onClick={() => { setError(false); setAttempt(attempt + 1); }}>Retry</button></p>
      : metrics ? <MetricDetails label="Contract records" metrics={metrics} /> : <p role="status">Loading contracts…</p>}
  </section>;
}
