'use client';

import { contractMetrics } from './ContractOverview';
import { manilaToday } from '../lib/room-context.mjs';
import { DashboardBreakdown } from './DashboardBreakdown';
import { DormOverview } from './DormOverview';
import { useEffect, useRef, useState } from 'react';
import { fetchOperationRows } from '../lib/workspace-loading';
import { OwnerDashboardLoading } from './OwnerDashboardLoading';
import { MetricDetails, type Metric, type MetricRecord } from './MetricDetails';

type Row = Record<string, unknown>;
const resources = ['maintenance', 'payments', 'invoices', 'tenants', 'rooms', 'assignments', 'concerns'] as const;
type Records = Record<typeof resources[number], Row[]>;
const tenantLink = (id: unknown) => '/management/rooms?tenant=' + encodeURIComponent(String(id));
const money = (amount: number, currency: unknown) => amount.toLocaleString('en-PH', { maximumFractionDigits: 2 }) + ' ' + String(currency ?? '—');
function counts(rows: Row[], key: (row: Row) => string) {
  const result = new Map<string, number>();
  for (const row of rows) result.set(key(row), (result.get(key(row)) ?? 0) + 1);
  return result;
}

export function AnalyticsWorkspace({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Records>();
  const [failed, setFailed] = useState(false);
  const [attempt, retry] = useState(0);
  const chartRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(resources.map(async name => [name, await fetchOperationRows(name, controller.signal)] as const))
      .then(entries => { if (!controller.signal.aborted) setData(Object.fromEntries(entries) as Records); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    const chart = chartRef.current;
    if (!data || !chart || !window.matchMedia('(max-width: 767px)').matches) return;
    const month = Number(manilaToday().slice(5, 7)) - 1;
    const current = chart.children.item(month) as HTMLElement | null;
    if (current) chart.scrollTo({ left: current.offsetLeft - chart.offsetLeft - (chart.clientWidth - current.offsetWidth) / 2, behavior: 'instant' });
  }, [data]);
  if (failed) return <><p role="alert">Dashboard records could not be loaded. <button onClick={() => { setFailed(false); retry(attempt + 1); }}>Retry</button></p>{children}</>;
  if (!data) return <OwnerDashboardLoading />;
  const names = new Map(data.tenants.map(row => [row.user_id, String(row.display_name)]));
  const rooms = new Map(data.rooms.map(row => [row.id, String(row.room_number)]));
  const invoices = new Map(data.invoices.map(row => [row.id, row]));
  const paid = new Map<unknown, number>();
  for (const row of data.payments) if (row.status === 'approved') paid.set(row.invoice_id, (paid.get(row.invoice_id) ?? 0) + Math.round(Number(row.amount)*100));
  const today = manilaToday();
  const { expiring, overview } = contractMetrics(data.assignments, data.tenants, data.rooms, today);
  const outstanding = data.invoices.filter(row => Math.round(Number(row.amount)*100) > (paid.get(row.id) ?? 0));
  const overdue = outstanding.filter(row => String(row.due_on) < today);
  const pending = data.payments.filter(row => row.status === 'pending');
  const tenant = (row: Row) => names.get(row.tenant_id) ?? 'Tenant';
  const repair = (row: Row): MetricRecord => {
    const status = String(row.status).replaceAll('_',' ');
    return { id:String(row.id), cells:[String(row.category), rooms.get(row.room_id) ?? '—', status, String(row.description)], status, createdAt: String(row.created_at),
      href:'/management/maintenance?roomId=' + encodeURIComponent(String(row.room_id)) };
  };
  const repairColumns = ['Issue', 'Room', 'Status', 'Description'];
  const overdueAccounts: Metric = { title:'Overdue Accounts', value:new Set(overdue.map(row => row.tenant_id)).size, note:'Tenants with outstanding rent', columns:['Tenant','Outstanding','Due date'], records:overdue.map(row => ({id:String(row.id), tenantId:typeof row.tenant_id === 'string' ? row.tenant_id : undefined, cells:[tenant(row), money((Math.round(Number(row.amount)*100)-(paid.get(row.id) ?? 0))/100,row.currency), String(row.due_on)], href:tenantLink(row.tenant_id)})) };
  const pendingPayments: Metric = { title:'Pending Payments', value:pending.length, note:'Awaiting verification', columns:['Tenant','Amount','Reference','Submitted'], records:pending.map(row => ({id:String(row.id),tenantId:typeof row.tenant_id === 'string' ? row.tenant_id : undefined,cells:[tenant(row),money(Number(row.amount), invoices.get(row.invoice_id)?.currency),String(row.reference_number ?? '—'),String(row.created_at).slice(0,10)],href:'/management/payments?search='+encodeURIComponent(String(row.reference_number || tenant(row)))})) };
  const maintenance: Metric = { title:'Maintenance Requests', value:data.maintenance.length, note:'All recorded requests', kind:'maintenance', columns:repairColumns, records:data.maintenance.map(repair) };
  const contractSummary: Metric = { ...expiring, breakdown: { initialTitle: 'Expiring Soon', metrics: overview } };
  const roomCounts = counts(data.assignments.filter(row => !row.ended_on), row => String(row.room_id));
  const year = Number(today.slice(0, 4));
  const monthly = Array.from({ length: 12 }, (_, month) => ({
    label: new Date(year, month, 1).toLocaleDateString('en-PH', { month: 'short' }),
    count: data.maintenance.filter(row => {
      const date = new Date(String(row.created_at));
      if (!Number.isFinite(date.getTime())) return false;
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' }).formatToParts(date);
      return Number(parts.find(part => part.type === 'year')?.value) === year &&
        Number(parts.find(part => part.type === 'month')?.value) === month + 1;
    }).length,
  }));
  const max = Math.max(10, Math.ceil(Math.max(...monthly.map(month => month.count)) / 10) * 10);
  return <div className="analytics-workspace owner-insights">
    <MetricDetails label="Dashboard records" metrics={[overdueAccounts, pendingPayments, maintenance, contractSummary]} />
    <DormOverview today={today} payments={data.payments} invoices={invoices} rooms={data.rooms}
      roomCounts={roomCounts} repairs={data.maintenance} tenantNames={names}>{children}</DormOverview>
    <section className="dashboard-panel analytics-monthly" aria-labelledby="maintenance-chart-title">
      <h2 id="maintenance-chart-title">Maintenance Requests Over Time</h2>
      <div ref={chartRef} className="analytics-months" role="group" aria-label={`Monthly maintenance requests for ${year}`}>
        {monthly.map(month => <div key={month.label} aria-label={`${month.label}: ${month.count} requests`} title={`${month.count} requests`}>
          <span className="analytics-month-count" aria-hidden="true">{month.count}</span>
          <span className="analytics-month-track" aria-hidden="true"><span style={{ height: `${month.count / max * 100}%` }} /></span>
          <span>{month.label}</span><small className="sr-only">{month.count} requests</small>
        </div>)}
      </div>
      <p>Monthly requests · {year}</p>
    </section>
    <DashboardBreakdown total={data.invoices.length} paid={data.invoices.length - outstanding.length}
      overdue={overdue.length} concerns={data.concerns} repairs={data.maintenance} />
  </div>;
}
