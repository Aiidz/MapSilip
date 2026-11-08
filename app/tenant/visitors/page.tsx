'use client';

import { useCallback, useEffect, useState } from 'react';
import { EmptyState, PageHeader, Panel } from '../../components/ui';
import { VisitorFormPreview } from '../../components/VisitorFormPreview';

type Visit = { id:string;visitor_name:string;visit_on:string;arrival_time:string|null;departure_time:string|null;purpose:string;cancelled_at:string|null };

export default function TenantVisitorsPage() {
  const [rows,setRows] = useState<Visit[]>([]);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [formOpen,setFormOpen] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/operations?resource=visits');
      if (!response.ok) throw new Error();setRows((await response.json()).rows);setError(''); }
    catch { setError('Planned visits could not be loaded.'); }
  },[]);
  useEffect(() => { const timer=window.setTimeout(() => void load(),0);return () => window.clearTimeout(timer); },[load]);
  async function cancel(id:string) {
    setNotice('');
    if (!window.confirm('Cancel this planned visit?')) return;
    const response = await fetch('/api/operations',{ method:'POST',headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ action:'visit.cancel',data:{ id } }) });
    if (response.ok) void load();else setError('The visit could not be cancelled.');
  }
  return <><PageHeader title="Visitors" description="A simple place for planned visit details."
    action={<button className="button button--primary" type="button" onClick={() => { setNotice(''); setFormOpen(true); }}>Plan a visit</button>} />
    {notice && <p role="status">{notice}</p>}
    <Panel title="Planned visits" description="Your upcoming and past visit details." icon="calendar">
      {error && <p role="alert">{error} <button type="button" onClick={() => void load()}>Retry</button></p>}
      {rows.length ? <div className="tenant-visit-list">{rows.map(row => <article key={row.id}>
        <div><strong>{row.visitor_name}</strong><p>{row.visit_on} · {row.arrival_time || '—'}–{row.departure_time || '—'}</p><small>{row.purpose}</small></div>
        {row.cancelled_at ? <span>Cancelled</span> : <button type="button" onClick={() => void cancel(row.id)}>Cancel</button>}
      </article>)}</div> : <EmptyState title="No planned visits to display" description="Your planned visits will appear here." icon="calendar" />}
    </Panel>
    <VisitorFormPreview open={formOpen} onClose={() => setFormOpen(false)} onSaved={() => { setNotice('Planned visit saved.'); void load(); }} />
  </>;
}
