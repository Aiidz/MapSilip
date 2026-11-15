'use client';

import { useCallback, useEffect, useState } from 'react';
import { EmptyState, PageHeader } from './ui';
import { Icon } from './Icon';
import { DataSkeleton } from './DataSkeleton';
import { VisitorFormPreview } from './VisitorFormPreview';

type Visit = { id:string;visitor_name:string;visit_on:string;arrival_time:string|null;departure_time:string|null;purpose:string;cancelled_at:string|null };
const time = (value:string|null) => value ? new Date(`2000-01-01T${value}`).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}) : 'Not set';
export function VisitorsWorkspace({ tenant = false }: { tenant?:boolean }) {
  const [rows,setRows] = useState<Visit[]>([]);
  const [page,setPage] = useState(1);
  const [count,setCount] = useState(0);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState('');
  const [query,setQuery] = useState('');
  const [filter,setFilter] = useState('All');
  const [formOpen,setFormOpen] = useState(false);
  const load = useCallback(async (signal?:AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/operations?${new URLSearchParams({resource:'visits',page:String(page),search:query})}`,{signal});
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (!signal?.aborted) { setRows(result.rows);setCount(result.count);setError(''); }
    } catch { if (!signal?.aborted) setError('Visits could not be loaded. Please try again.'); }
    finally { if (!signal?.aborted) setLoading(false); }
  },[page,query]);
  useEffect(() => { const controller = new AbortController();const timer=setTimeout(()=>void load(controller.signal),150);return()=>{clearTimeout(timer);controller.abort();}; },[load]);
  async function cancel(id:string) {
    if (busy || !window.confirm('Cancel this planned visit?')) return;
    setBusy(id);
    try {
      const response=await fetch('/api/operations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'visit.cancel',data:{id}})});
      if (!response.ok) throw new Error();
      await load();
    } catch { setError('The visit could not be cancelled. Please try again.'); }
    finally { setBusy(''); }
  }
  const today = new Date().toLocaleDateString('en-CA');
  const visible = rows.filter(row => filter==='All' || (filter==='Cancelled' ? Boolean(row.cancelled_at) : !row.cancelled_at && (filter==='Upcoming' ? row.visit_on>=today : row.visit_on<today)));
  return <div className="visitors-workspace">
    <PageHeader title="Visitors" description={tenant ? 'Plan time with the people you’re expecting.' : 'Keep track of planned visits to the dormitory.'} action={tenant && <button className="button button--primary" onClick={()=>setFormOpen(true)}><Icon name="users" />Plan a visit</button>} />
    <div className="visitors-toolbar"><label className="notifications-search"><Icon name="search" /><span className="sr-only">Search visitors</span><input type="search" placeholder="Search visitors…" value={query} onChange={event=>{setQuery(event.target.value);setPage(1);}} /></label>
      <div className="visitors-tabs" aria-label="Filter visits">{['All','Upcoming','Past','Cancelled'].map(label=><button key={label} aria-pressed={filter===label} onClick={()=>setFilter(label)}>{label}</button>)}</div>
    </div>
    {error && <p role="alert">{error} <button onClick={()=>void load()}>Retry</button></p>}
    {loading ? <DataSkeleton label="Loading visits" /> : <section className="visitors-feed" aria-label="Planned visits">
      {visible.map(row=><article className="visitor-card" key={row.id}>
        <header><span className="visitor-avatar" aria-hidden="true">{row.visitor_name.trim().slice(0,1).toUpperCase()}</span><div><h2>{row.visitor_name}</h2><span className="visitor-status">{row.cancelled_at ? 'Cancelled' : row.visit_on===today ? 'Today' : row.visit_on>today ? 'Upcoming' : 'Past visit'}</span></div></header>
        <div className="visitor-schedule"><Icon name="calendar" /><div><strong>{new Date(`${row.visit_on}T12:00:00`).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'})}</strong><span>{time(row.arrival_time)} – {time(row.departure_time)}</span></div></div>
        <p className="visitor-purpose">{row.purpose}</p>
        {tenant && !row.cancelled_at && <footer><button className="button button--secondary" disabled={Boolean(busy)} onClick={()=>void cancel(row.id)}>{busy===row.id ? 'Cancelling…' : 'Cancel visit'}</button></footer>}
      </article>)}
      {!visible.length && <EmptyState title="No visits to display" description={filter==='All' ? 'Planned visitors will appear here.' : 'No visits in this category on the current page.'} icon="users" />}
    </section>}
    {count>25 && <div className="operational-pagination"><button disabled={page===1||loading} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page} of {Math.ceil(count/25)}</span><button disabled={page*25>=count||loading} onClick={()=>setPage(page+1)}>Next</button></div>}
    {tenant && <VisitorFormPreview open={formOpen} onClose={()=>setFormOpen(false)} onSaved={()=>void load()} />}
  </div>;
}
