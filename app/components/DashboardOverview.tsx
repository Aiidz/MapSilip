'use client';

import { AnalyticsWorkspace } from './AnalyticsWorkspace';
import { DataSkeleton } from './DataSkeleton';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createLatestRequest } from '../lib/workspace-loading';
import { Icon } from './Icon';
import { EmptyState, PageHeader } from './ui';
import { formatTenantMonthlyRent } from '../lib/tenant-dashboard.mjs';
import dynamic from 'next/dynamic';
const AccountRequestsDialog = dynamic(() => import('./AccountRequestsDialog').then(module => module.AccountRequestsDialog));

type Row = Record<string, unknown>;
type Summary = Record<string, unknown>;
type Role = 'owner' | 'caretaker' | 'tenant';
const number = (value: unknown) => Number(value || 0);
const text = (value: unknown) => typeof value === 'string' ? value : '—';

export function DashboardOverview({ role, showAccessRequests = false }: { role: Role; showAccessRequests?: boolean }) {
  const [data, setData] = useState<Summary | null>(null);
  const [recent, setRecent] = useState<Row[]>([]);
  const [roomNumbers, setRoomNumbers] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const requests = useRef(createLatestRequest());
  const load = useCallback(async () => {
    const request = requests.current.start();
    const get = (url: string) => fetch(url, { signal: request.signal });
    try {
      const resource = role === 'tenant' ? 'notifications' : 'maintenance';
      if (role === 'owner') {
        const response = await get('/api/dashboard');
        if (!response.ok) throw new Error();
        const summary = await response.json();
        if (request.isCurrent()) { setData(summary); setError(''); }
        return;
      }
      const roomLabelsPromise = role === 'caretaker'
        ? get('/api/operations?resource=rooms&page=1&pageSize=100')
          .then(async response => response.ok ? response.json() : null).catch(() => null)
        : Promise.resolve(null);
      const [summary, recentResponse, roomLabels, pendingResponse, progressResponse] = await Promise.all([
        get('/api/dashboard').then(async response => {
          if (!response.ok) throw new Error();
          const summary = await response.json();
          if (request.isCurrent() && role !== 'caretaker') setData({ ...summary });
          return summary;
        }), get(`/api/operations?resource=${resource}&page=1&pageSize=8`), roomLabelsPromise,
        role === 'caretaker' ? get('/api/operations?resource=maintenance&status=pending&page=1&pageSize=1') : null,
        role === 'caretaker' ? get('/api/operations?resource=maintenance&status=in_progress&page=1&pageSize=1') : null,
      ]);
      if (!request.isCurrent()) return;
      if (!recentResponse.ok) throw new Error();
      const list = await recentResponse.json();
      if (!request.isCurrent()) return;
      if (role === 'caretaker') {
        if (!pendingResponse?.ok || !progressResponse?.ok) throw new Error();
        const [pendingList, progressList] = await Promise.all([pendingResponse.json(), progressResponse.json()]);
        if (!request.isCurrent()) return;
        summary.total_requests = list.count;
        summary.pending_count = pendingList.count;
        summary.in_progress_count = progressList.count;
        if (roomLabels?.rows) setRoomNumbers(Object.fromEntries((roomLabels.rows as Row[]).map(room => [String(room.id), String(room.room_number)])));
      }
      setData(summary); setRecent(list.rows.slice(0,8)); setError('');
    } catch { if (request.isCurrent()) setError('Dashboard data could not be loaded.'); }
  }, [role]);
  useEffect(() => { const activeRequests = requests.current; const timer = window.setTimeout(() => void load(),0); return () => { window.clearTimeout(timer); activeRequests.cancel(); }; }, [load]);
  const retry = error && <p role="alert" className="dashboard-data-error">{error} <button type="button" onClick={() => void load()}>Retry</button></p>;
  if (role === 'owner') {
    const actionItems = [
      { label:'Payment proofs to review', count:number(data?.pending_payments), href:'/management/payments', note:'submissions awaiting review', tone:'error' },
      { label:'Open maintenance requests', count:number(data?.pending_maintenance), href:'/management/maintenance', note:'requests need follow-up', tone:'warning' },
      { label:'Tenant access requests', count:number(data?.pending_accounts), href:'/management?accessRequests=1', note:'applications awaiting review', tone:'info' },
    ].filter(item => item.count > 0);
    return <div className="management-dashboard">
      {showAccessRequests && <AccountRequestsDialog open />}
      <PageHeader title="Dashboard"
        action={<><Link className="dashboard-export" href="/management/storage"><Icon name="download" />Export Data</Link></>} />
      {retry}
      <AnalyticsWorkspace>
      <section className="dashboard-panel dashboard-actions" aria-labelledby="dashboard-actions-title"><div className="dashboard-actions__header">
        <h2 id="dashboard-actions-title">Action Required</h2><Link href="/management/notifications">View All <span aria-hidden="true">→</span></Link>
      </div>{data && actionItems.length ? <div className="dashboard-action-list">{actionItems.map(item => <Link href={item.href} key={item.label}>
        <span className={`dashboard-action-list__dot dashboard-action-list__dot--${item.tone}`} aria-hidden="true" />
        <span className="dashboard-action-list__content"><strong>{item.label}</strong><small>{item.count} {item.note}</small></span>
      </Link>)}</div>
        : data ? <p className="dashboard-actions__empty">Nothing needs attention right now.</p> : <DataSkeleton label="Loading action items" count={2} />}
      </section>
      </AnalyticsWorkspace>
    </div>;
  }
  if (role === 'caretaker') {
    const cards = [
      ['Total Requests',data ? number(data.total_requests) : '—','Recorded repairs'],
      ['Pending',data ? number(data.pending_count) : '—','Awaiting action'],
      ['In Progress',data ? number(data.in_progress_count) : '—','Being handled'],
      ['Urgent Requests','—','Priority not tracked'],
    ];
    return <div className="caretaker-dashboard"><PageHeader title="Dashboard" />{retry}
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
  const tenantFullName = typeof data?.display_name === 'string' ? data.display_name.trim() : typeof data?.name === 'string' ? data.name.trim() : '';
  const tenantName = tenantFullName.split(/\s+/)[0] || 'Tenant';
  const shortcuts = [
    { title:'My Details', text:'Personal and stay information', href:'/tenant/details', icon:'users' as const },
    { title:'Payments', text:'Billing information and history', href:'/tenant/payments', icon:'wallet' as const },
    { title:'Maintenance', text:'Requests and updates', href:'/tenant/maintenance', icon:'wrench' as const },
    { title:'Concerns & Suggestions', text:'Share feedback with the team', href:'/tenant/concerns', icon:'sparkles' as const },
  ];
  return <div className="tenant-home"><section className="tenant-home-summary tenant-home-summary--welcome"><div><h1><span className="tenant-greeting-desktop">Welcome back, {tenantName}!</span><span className="tenant-greeting-mobile">Hello, <strong>{tenantName}!</strong></span></h1></div>
      <div className="tenant-home-summary__facts"><div><span>Your room</span><strong>{text(data?.room)}</strong></div><div><span>Monthly rent</span><strong>{formatTenantMonthlyRent(data?.monthly_rent as number | string | null | undefined)}</strong></div></div>
    </section>{retry}
    <section className="tenant-home-shortcuts" aria-labelledby="tenant-shortcuts-title"><div className="tenant-section-heading"><div><h2 id="tenant-shortcuts-title">Quick Access</h2><p>Common details and services.</p></div></div>
      <div className="tenant-shortcut-grid">{shortcuts.map(item => <Link className="tenant-shortcut" href={item.href} key={item.href}><span className="tenant-summary-icon"><Icon name={item.icon} /></span><span><strong>{item.title === 'Concerns & Suggestions' ? <><span className="tenant-shortcut-desktop-label">{item.title}</span><span className="tenant-shortcut-mobile-label">Concerns</span></> : item.title}</strong><small>{item.text}</small></span><Icon name="chevron" className="tenant-shortcut__chevron" /></Link>)}</div>
    </section>
    <section className="tenant-recent"><div className="tenant-recent__header"><h2>Recent Notifications</h2><Link href="/tenant/notifications">View All</Link></div>
      {recent.length ? <div className="tenant-recent-list">{recent.slice(0,8).map(row => <Link href={text(row.href)} key={String(row.id)}><span className="tenant-recent-list__icon"><Icon name="receipt" /></span><span className="tenant-recent-list__copy"><strong>{text(row.title)}</strong><small>{text(row.body)}</small></span><time>{row.created_at ? new Date(String(row.created_at)).toLocaleDateString() : ''}</time></Link>)}</div>
        : <div className="tenant-empty-inline"><span className="tenant-summary-icon"><Icon name="bell" /></span><div><strong>No notifications to display</strong><p>New account updates will appear here.</p></div></div>}
    </section>
  </div>;
}
