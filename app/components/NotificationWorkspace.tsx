'use client';

import { DataSkeleton } from './DataSkeleton';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createLatestRequest } from '../lib/workspace-loading';
import { Icon } from './Icon';
import { PageHeader } from './ui';

type Notice = { id:string;title:string;body:string;href:string;event_key:string;read_at:string|null;created_at:string };
type Area = 'management' | 'caretaker' | 'tenant';

export function NotificationWorkspace({ area }: { area: Area }) {
  const router = useRouter();
  const [rows,setRows] = useState<Notice[]>([]);
  const [count,setCount] = useState(0);
  const [page,setPage] = useState(1);
  const [query,setQuery] = useState('');
  const [category,setCategory] = useState('');
  const [read,setRead] = useState('unread');
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const requests = useRef(createLatestRequest());
  const load = useCallback(async () => {
    const request = requests.current.start();
    setLoading(true);
    try {
      const params = new URLSearchParams({ resource:'notifications',page:String(page),search:query,category,read });
      const response = await fetch(`/api/operations?${params}`, { signal: request.signal });
      if (!response.ok) throw new Error();
      const result = await response.json(); if (!request.isCurrent()) return; setRows(result.rows);setCount(result.count);setError('');
    } catch { if (!request.isCurrent()) return; setError('Notifications could not be loaded.'); }
    finally { if (request.isCurrent()) setLoading(false); }
  },[page,query,category,read]);
  useEffect(() => { const activeRequests = requests.current; const timer=window.setTimeout(() => void load(),150);return () => { window.clearTimeout(timer); activeRequests.cancel(); }; },[load]);
  useEffect(() => {
    const updated = () => { void load(); };
    window.addEventListener('mapsilip-notifications-updated', updated);
    return () => window.removeEventListener('mapsilip-notifications-updated', updated);
  }, [load]);
  async function markRead(id:string) {
    const response = await fetch('/api/operations',{ method:'POST',headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ action:'notification.read',data:{ id } }) });
    if (response.ok) { setRows(current => current.map(row => row.id === id ? { ...row, read_at: new Date().toISOString() } : row)); window.dispatchEvent(new Event('mapsilip-notifications-updated')); void load(); return true; }
    setError('Notification could not be marked read.'); return false;
  }
  const filters = [['unread','Unread'],['read','Read'],['','All']];
  const categories = area === 'caretaker' ? []
    : [['','All categories'],['payments','Payments'],['maintenance','Maintenance'],['concerns','Concerns'],['accounts','Access'],['visits','Visitors']];
  return <div className="notifications-workspace"><PageHeader title="Notifications" description="Stay informed about important dormitory updates." action={<button type="button" className="button button--secondary" onClick={() => window.dispatchEvent(new Event('mapsilip-open-app-settings'))}><Icon name="bell" />Settings</button>} />
    <label className="notifications-search"><Icon name="search" /><span className="sr-only">Search notifications</span>
      <input type="search" placeholder="Search notifications..." value={query} onChange={event => { setQuery(event.target.value);setPage(1); }} /></label>
    <div className="notifications-filters" role="group" aria-label="Notification sections">{filters.map(([id,label]) => <button type="button" key={id}
      aria-pressed={read===id} className={read===id ? 'is-active' : ''}
      onClick={() => { setRead(id);setPage(1); }}>{label}</button>)}</div>
    {categories.length > 0 && <div className="notifications-filters" role="group" aria-label="Notification categories">{categories.map(([id,label]) => <button type="button" key={id}
      aria-pressed={category===id} className={category===id ? 'is-active' : ''}
      onClick={() => { setCategory(id);setPage(1); }}>{label}</button>)}</div>}
    {error && <p role="alert">{error} <button type="button" onClick={() => void load()}>Retry</button></p>}
    {loading && !rows.length ? <DataSkeleton label="Loading notifications" /> : rows.length ? <div className="notifications-list">{rows.map(row => <article key={row.id} className={row.read_at ? '' : 'is-unread'}>
      <span className="notifications-list__icon"><Icon name={row.event_key.startsWith('maintenance:') ? 'wrench' : row.event_key.startsWith('payment:') || row.event_key.startsWith('invoice:') ? 'wallet' : 'bell'} /></span>
      <div><Link href={row.href} onClick={async event => { if (row.read_at) return; event.preventDefault(); if (await markRead(row.id)) router.push(row.href); }}><strong>{row.title}</strong></Link><p>{row.body}</p></div>
      <div className="notifications-list__meta"><time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString()}</time>
        {!row.read_at && <button type="button" onClick={() => void markRead(row.id)}>Mark read</button>}</div>
    </article>)}</div> : <div className="notifications-empty"><Icon name="bell" /><strong>No notifications to display</strong><p>New account updates will appear here.</p></div>}
    {count > 25 && <div className="operational-pagination"><button type="button" disabled={page===1} onClick={() => setPage(page-1)}>Previous</button><span>{page} / {Math.ceil(count/25)}</span><button type="button" disabled={page*25>=count} onClick={() => setPage(page+1)}>Next</button></div>}
  </div>;
}
