'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from './Icon';
import { EmptyState, PageHeader } from './ui';
import dynamic from 'next/dynamic';
const AccountRequestsDialog = dynamic(() => import('./AccountRequestsDialog').then(module => module.AccountRequestsDialog));

type Row = Record<string, unknown>;
type Summary = Record<string, unknown>;
type Role = 'owner' | 'caretaker' | 'tenant';
const number = (value: unknown) => Number(value || 0);
const text = (value: unknown) => typeof value === 'string' ? value : '—';
const statuses = (value: unknown) => value && typeof value === 'object' ? value as Record<string,number> : {};

export function DashboardOverview({ role, showAccessRequests = false }: { role: Role; showAccessRequests?: boolean }) {
  const [data, setData] = useState<Summary | null>(null);
  const [recent, setRecent] = useState<Row[]>([]);
  const [roomNumbers, setRoomNumbers] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const resource = role === 'tenant' ? 'notifications' : 'maintenance';
      const roomCountPromise = role === 'owner'
        ? fetch('/api/operations?resource=rooms&page=1&pageSize=1')
          .then(async response => response.ok ? response.json() : null).catch(() => null)
        : Promise.resolve(null);
      const roomLabelsPromise = role === 'caretaker'
        ? fetch('/api/operations?resource=rooms&page=1&pageSize=100')
          .then(async response => response.ok ? response.json() : null).catch(() => null)
        : Promise.resolve(null);
      const [summaryResponse, recentResponse, roomSummary, roomLabels, pendingResponse, progressResponse] = await Promise.all([
        fetch('/api/dashboard'), fetch(`/api/operations?resource=${resource}&page=1&pageSize=8`), roomCountPromise, roomLabelsPromise,
        role === 'caretaker' ? fetch('/api/operations?resource=maintenance&status=pending&page=1&pageSize=1') : null,
        role === 'caretaker' ? fetch('/api/operations?resource=maintenance&status=in_progress&page=1&pageSize=1') : null,
      ]);
      if (!summaryResponse.ok || !recentResponse.ok) throw new Error();
      const [summary, list] = await Promise.all([summaryResponse.json(), recentResponse.json()]);
      if (role === 'owner') summary.total_rooms = Number.isInteger(roomSummary?.count) ? roomSummary.count : null;
      if (role === 'caretaker') {
        if (!pendingResponse?.ok || !progressResponse?.ok) throw new Error();
        const [pendingList, progressList] = await Promise.all([pendingResponse.json(), progressResponse.json()]);
        summary.total_requests = list.count;
        summary.pending_count = pendingList.count;
        summary.in_progress_count = progressList.count;
        if (roomLabels?.rows) setRoomNumbers(Object.fromEntries((roomLabels.rows as Row[]).map(room => [String(room.id), String(room.room_number)])));
      }
      setData(summary); setRecent(list.rows.slice(0,8)); setError('');
    } catch { setError('Dashboard data could not be loaded.'); }
  }, [role]);
  useEffect(() => { const timer = window.setTimeout(() => void load(),0); return () => window.clearTimeout(timer); }, [load]);
  const retry = error && <p role="alert" className="dashboard-data-error">{error} <button type="button" onClick={() => void load()}>Retry</button></p>;
  if (role === 'owner') {
    const income = (data?.income_by_currency as { currency: string; amount: number }[] | undefined) ?? [];
    const incomeText = income.length ? income.map(item => `${item.currency} ${item.amount}`).join(' · ') : '—';
    const totalRooms = typeof data?.total_rooms === 'number' ? data.total_rooms : null;
    const occupancyNote = !data ? 'Rooms with residents' : totalRooms === null ? '—% Occupancy'
      : `${totalRooms ? Math.round(number(data.occupied_rooms) / totalRooms * 100) : 0}% Occupancy`;
    const cards = [
      { label:'Total Rent Income', value:incomeText, note:'Approved payments', financial:true },
      { label:'Occupied Units', value:data ? number(data.occupied_rooms) : '—', note:occupancyNote },
      { label:'Vacant Units', value:data ? number(data.vacant_rooms) : '—', note:'Available rooms without residents' },
      { label:'Under Maintenance', value:data ? number(data.maintenance_rooms) : '—', note:'Rooms currently unavailable' },
    ];
    const weekly = (data?.weekly_maintenance as { day:string; count:number }[] | undefined) ?? [];
    const weeklyMax = Math.max(10, Math.ceil(Math.max(0,...weekly.map(day => number(day.count))) / 10) * 10);
    const weeklyTicks = Array.from({ length: 6 }, (_, index) => weeklyMax - (weeklyMax / 5) * index);
    const overview = statuses(data?.payment_overview);
    const total = number(overview.paid)+number(overview.pending)+number(overview.overdue);
    const paidPct = total ? 100*number(overview.paid)/total : 0;
    const pendingPct = total ? 100*number(overview.pending)/total : 0;
    const actionItems = [
      { label:'Payment proofs to review', count:number(data?.pending_payments), href:'/management/payments', note:'submissions awaiting review', tone:'error' },
      { label:'Open maintenance requests', count:number(data?.pending_maintenance), href:'/management/maintenance', note:'requests need follow-up', tone:'warning' },
      { label:'Tenant access requests', count:number(data?.pending_accounts), href:'/management?accessRequests=1', note:'applications awaiting review', tone:'info' },
    ].filter(item => item.count > 0);
    return <div className="management-dashboard">
      {showAccessRequests && <AccountRequestsDialog open />}
      <PageHeader title="Dashboard" description="Plan, prioritize, and accomplish your property tasks with ease."
        action={<button className="dashboard-export" type="button" disabled><Icon name="download" />Export Data</button>} />
      {retry}
      <section className="dashboard-summary" aria-label="Workspace summary">{cards.map(card => <article
        className={`dashboard-summary__item${card.financial ? ' dashboard-summary__item--financial' : ''}`} key={card.label}>
        <h2>{card.label}</h2><span className="dashboard-summary__value">{card.value}</span><p>{card.note}</p>
        <span className="dashboard-summary__mark" aria-hidden="true"><Icon name="arrow" /></span>
      </article>)}</section>
      <div className="dashboard-charts">
        <section className="dashboard-panel dashboard-chart" aria-label="Weekly Maintenance Activity"><h2>Weekly Maintenance Activity</h2>
          {weekly.length ? <div className="dashboard-weekly-chart" role="group" aria-label={`Weekly request chart scale: 0 to ${weeklyMax} requests per day.`}>
            <div className="dashboard-weekly-axis" aria-hidden="true">{weeklyTicks.map(tick => <span key={tick}>{tick}</span>)}</div>
            <div className="dashboard-weekly-bars">{weekly.map(day => <div key={day.day}>
              <span className="dashboard-weekly-bar-track"><span className={number(day.count) > 0 ? 'has-activity' : undefined} style={{ height:`${100*Math.max(0,number(day.count))/weeklyMax}%` }} /></span>
              <strong>{new Date(`${day.day}T00:00:00`).toLocaleDateString(undefined,{ weekday:'short' })}</strong>
              <small>{day.count}</small>
            </div>)}</div>
          </div> : <div className="dashboard-chart__empty"><Icon name="wrench" /><p>{data ? 'No requests in the last seven days.' : 'Loading chart…'}</p></div>}
        </section>
        <section className="dashboard-panel dashboard-chart" aria-label="Payment Overview"><h2>Payment Overview</h2>
          {total ? <div className="dashboard-payment-chart">
            <div className="dashboard-payment-donut" role="img" aria-label={`${overview.paid || 0} paid, ${overview.pending || 0} pending, ${overview.overdue || 0} overdue invoices`}
              style={{ background:`conic-gradient(var(--status-success) 0 ${paidPct}%, var(--status-warning) ${paidPct}% ${paidPct+pendingPct}%, var(--status-error) ${paidPct+pendingPct}% 100%)` }} />
            <div className="dashboard-payment-legend">
              <span><i className="dashboard-payment-legend__dot dashboard-payment-legend__dot--paid" aria-hidden="true" />Paid</span>
              <span><i className="dashboard-payment-legend__dot dashboard-payment-legend__dot--pending" aria-hidden="true" />Pending</span>
              <span><i className="dashboard-payment-legend__dot dashboard-payment-legend__dot--overdue" aria-hidden="true" />Overdue</span>
            </div>
          </div> : data ? <div className="dashboard-payment-chart">
            <div className="dashboard-payment-donut dashboard-payment-donut--empty" aria-hidden="true" />
            <div className="dashboard-payment-legend">
              <span><i className="dashboard-payment-legend__dot dashboard-payment-legend__dot--paid" aria-hidden="true" />Paid 0</span>
              <span><i className="dashboard-payment-legend__dot dashboard-payment-legend__dot--pending" aria-hidden="true" />Pending 0</span>
              <span><i className="dashboard-payment-legend__dot dashboard-payment-legend__dot--overdue" aria-hidden="true" />Overdue 0</span>
            </div>
            <p className="dashboard-payment-chart__empty">No invoices to chart.</p>
          </div> : <div className="dashboard-chart__empty"><Icon name="wallet" /><p>Loading chart…</p></div>}
        </section>
      </div>
      <section className="dashboard-panel dashboard-actions" aria-labelledby="dashboard-actions-title"><div className="dashboard-actions__header">
        <h2 id="dashboard-actions-title">Action Required</h2><Link href="/management/notifications">View All <span aria-hidden="true">→</span></Link>
      </div>{data && actionItems.length ? <div className="dashboard-action-list">{actionItems.map(item => <Link href={item.href} key={item.label}>
        <span className={`dashboard-action-list__dot dashboard-action-list__dot--${item.tone}`} aria-hidden="true" />
        <span className="dashboard-action-list__content"><strong>{item.label}</strong><small>{item.count} {item.note}</small></span>
      </Link>)}</div>
        : <p className="dashboard-actions__empty">{data ? 'Nothing needs attention right now.' : 'Loading action items…'}</p>}
      </section>
    </div>;
  }
  if (role === 'caretaker') {
    const cards = [
      ['Total Requests',data ? number(data.total_requests) : '—','Recorded repairs'],
      ['Pending',data ? number(data.pending_count) : '—','Awaiting action'],
      ['In Progress',data ? number(data.in_progress_count) : '—','Being handled'],
      ['Urgent Requests','—','Priority not tracked'],
    ];
    return <div className="caretaker-dashboard"><PageHeader title="Dashboard" description="Monitor and respond to tenant maintenance requests." />{retry}
      <section className="caretaker-summary" aria-label="Maintenance request summary">{cards.map(([label,value,note]) => <article className="caretaker-summary__card" key={label}>
        <div><h2>{label}</h2><span>{value}</span><p>{note}</p></div><span className="caretaker-summary__icon" aria-hidden="true"><Icon name="arrow" /></span>
      </article>)}</section>
      <section className="caretaker-dashboard-recent" aria-labelledby="caretaker-recent-title"><header><h2 id="caretaker-recent-title">Recent Maintenance Requests</h2><Link href="/caretaker/maintenance">View All</Link></header>
        {recent.length ? <div className="caretaker-dashboard-recent__list">{recent.map(row => {
          const status = text(row.status);
          const createdAt = typeof row.created_at === 'string' ? row.created_at : '';
          return <Link href="/caretaker/maintenance" key={String(row.id)}><span className="caretaker-dashboard-recent__request"><strong>{text(row.category)}</strong><small>{roomNumbers[String(row.room_id)] ? `Room ${roomNumbers[String(row.room_id)]}` : 'Room unavailable'}</small></span>
            <span className="caretaker-dashboard-recent__meta"><span className={`caretaker-dashboard-recent__status caretaker-dashboard-recent__status--${status}`}>{status.replaceAll('_', ' ')}</span><time dateTime={createdAt}>{createdAt ? new Date(createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</time></span></Link>;
        })}</div>
          : <EmptyState title="No maintenance requests to display" description="New requests will appear here when available." icon="wrench" />}
      </section>
    </div>;
  }
  const invoice = data?.next_invoice as Record<string,unknown> | undefined;
  const tenantName = typeof data?.display_name === 'string' ? data.display_name : typeof data?.name === 'string' ? data.name : 'Tenant';
  const shortcuts = [
    { title:'My Details', text:'Personal and stay information', href:'/tenant/details', icon:'users' as const },
    { title:'Payments', text:'Billing information and history', href:'/tenant/payments', icon:'wallet' as const },
    { title:'Maintenance', text:'Requests and updates', href:'/tenant/maintenance', icon:'wrench' as const },
    { title:'Concerns & Suggestions', text:'Share feedback with the team', href:'/tenant/concerns', icon:'sparkles' as const },
  ];
  return <div className="tenant-home"><section className="tenant-home-summary tenant-home-summary--welcome"><div><h1>Welcome back, {tenantName}!</h1><p>Manage your stay and keep track of your dormitory activities.</p></div>
      <div className="tenant-home-summary__facts"><div><span>Your room</span><strong>{text(data?.room)}</strong></div><div><span>Monthly rent</span><strong>{invoice ? `${invoice.currency} ${invoice.amount}` : '—'}</strong></div></div>
    </section>{retry}
    <section className="tenant-home-shortcuts" aria-labelledby="tenant-shortcuts-title"><div className="tenant-section-heading"><div><h2 id="tenant-shortcuts-title">Quick Access</h2><p>Common details and services.</p></div></div>
      <div className="tenant-shortcut-grid">{shortcuts.map(item => <Link className="tenant-shortcut" href={item.href} key={item.href}><span className="tenant-summary-icon"><Icon name={item.icon} /></span><span><strong>{item.title}</strong><small>{item.text}</small></span><Icon name="chevron" className="tenant-shortcut__chevron" /></Link>)}</div>
    </section>
    <section className="tenant-recent"><div className="tenant-recent__header"><h2>Recent Notifications</h2><Link href="/tenant/notifications">View All</Link></div>
      {recent.length ? <div className="tenant-recent-list">{recent.slice(0,3).map(row => <Link href={text(row.href)} key={String(row.id)}><span className="tenant-recent-list__icon"><Icon name="receipt" /></span><span className="tenant-recent-list__copy"><strong>{text(row.title)}</strong><small>{text(row.body)}</small></span><time>{row.created_at ? new Date(String(row.created_at)).toLocaleDateString() : ''}</time></Link>)}</div>
        : <div className="tenant-empty-inline"><span className="tenant-summary-icon"><Icon name="bell" /></span><div><strong>No notifications to display</strong><p>New account updates will appear here.</p></div></div>}
    </section>
  </div>;
}
