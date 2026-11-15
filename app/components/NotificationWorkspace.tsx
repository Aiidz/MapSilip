'use client';

import { NotificationRecordDetail } from './NotificationRecordDetail';
import { DataSkeleton } from './DataSkeleton';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createLatestRequest } from '../lib/workspace-loading';
import { Icon, type IconName } from './Icon';
import { PageHeader } from './ui';

type Notice = { id:string;title:string;body:string;href:string;event_key:string;read_at:string|null;created_at:string;actor_id?:string|null;actor_name?:string|null };
type Area = 'management' | 'caretaker' | 'tenant';

function NoticeAvatar({ name, userId, className, version, fallback = 'users' }: { name?: string | null; userId?: string | null; className: string; version: number; fallback?: IconName }) {
  const [failedVersion, setFailedVersion] = useState<number | null>(null);
  const initials = name?.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return <span className={className} aria-hidden="true">
    {initials || <Icon name={fallback} />}
    {userId && failedVersion !== version && <Image src={`/api/profile/photo?userId=${encodeURIComponent(userId)}&v=${version}`} alt="" width={56} height={56} unoptimized loading="lazy" className="notifications-avatar__image" onError={() => setFailedVersion(version)} />}
  </span>;
}

function noticeIcon(row: Notice) {
  if (row.event_key.startsWith('maintenance:')) return 'wrench' as const;
  if (row.event_key.startsWith('payment:') || row.event_key.startsWith('invoice:')) return 'wallet' as const;
  if (row.event_key.startsWith('account-request:')) return 'users' as const;
  if (row.event_key.startsWith('concern:')) return 'sparkles' as const;
  if (row.event_key.startsWith('visit:')) return 'calendar' as const;
  return 'bell' as const;
}

export function NotificationWorkspace({ area }: { area: Area }) {
  const router = useRouter();
  const [rows,setRows] = useState<Notice[]>([]);
  const [photoVersion,setPhotoVersion] = useState(0);
  const [count,setCount] = useState(0);
  const [page,setPage] = useState(1);
  const [query,setQuery] = useState('');
  const [read,setRead] = useState('');
  const [selectedId,setSelectedId] = useState('');
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const lastSelectedButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { if (selectedId) detailHeading.current?.focus({ preventScroll: true }); }, [selectedId]);
  const requests = useRef(createLatestRequest());
  const load = useCallback(async () => {
    const request = requests.current.start();
    setLoading(true);
    try {
      const params = new URLSearchParams({ resource:'notifications',page:String(page),search:query,read });
      const response = await fetch(`/api/operations?${params}`, { signal: request.signal });
      if (!response.ok) throw new Error();
      const result = await response.json(); if (!request.isCurrent()) return; setRows(result.rows);setCount(result.count);setPhotoVersion(Date.now());setError('');
    } catch { if (!request.isCurrent()) return; setError('Notifications could not be loaded.'); }
    finally { if (request.isCurrent()) setLoading(false); }
  },[page,query,read]);
  useEffect(() => { const activeRequests = requests.current; const timer=window.setTimeout(() => void load(),150);return () => { window.clearTimeout(timer); activeRequests.cancel(); }; },[load]);
  useEffect(() => {
    const updated = () => { void load(); };
    window.addEventListener('mapsilip-notifications-updated', updated);
    window.addEventListener('mapsilip-profile-photo-updated', updated);
    return () => { window.removeEventListener('mapsilip-notifications-updated', updated); window.removeEventListener('mapsilip-profile-photo-updated', updated); };
  }, [load]);
  async function markRead(id:string) {
    try {
    const response = await fetch('/api/operations',{ method:'POST',headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ action:'notification.read',data:{ id } }) });
    if (response.ok) {
      if (read === 'unread') { setRows(current => current.filter(row => row.id !== id)); setCount(current => Math.max(0, current - 1)); }
      else setRows(current => current.map(row => row.id === id ? { ...row, read_at: new Date().toISOString() } : row));
      window.dispatchEvent(new Event('mapsilip-notifications-updated'));
      return true;
    }
    } catch { /* Show the same retryable error for a network failure. */ }
    setError('Notification could not be marked read.'); return false;
  }
  const selected = rows.find(row => row.id === selectedId) ?? null;
  return <div className={`notifications-workspace${selected ? ' has-selection' : ''}`}><PageHeader title="Notifications" action={<button type="button" className="button button--secondary" onClick={() => window.dispatchEvent(new Event('mapsilip-open-app-settings'))}><Icon name="bell" />Settings</button>} />
    <label className="notifications-search"><Icon name="search" /><span className="sr-only">Search notifications</span>
      <input type="search" placeholder="Search notifications..." value={query} onChange={event => { setQuery(event.target.value);setPage(1);setSelectedId(''); }} /></label>
    <div className="notifications-filters" role="group" aria-label="Filter notifications">
      {[[ '', 'All' ],[ 'unread', 'Unread' ]].map(([id,label]) => <button type="button" key={id}
        aria-pressed={read===id} className={read===id ? 'is-active' : ''}
        onClick={() => { setRead(id);setPage(1);setSelectedId(''); }}>{label}</button>)}
    </div>
    {error && <p role="alert">{error} <button type="button" onClick={() => void load()}>Retry</button></p>}
    {loading && !rows.length ? <DataSkeleton label="Loading notifications" /> : rows.length ? <div className={`notifications-workspace__split${selected ? ' has-selection' : ''}`}>
      <section className="notifications-list" aria-label="Notification list">{rows.map(row => <article key={row.id} className={`notifications-list__item${row.read_at ? '' : ' is-unread'}${selectedId === row.id ? ' is-selected' : ''}`}>
        <button type="button" className="notifications-list__select" aria-pressed={selectedId === row.id} aria-controls="notification-detail" onClick={event => { lastSelectedButton.current = event.currentTarget; setSelectedId(row.id); }}>
          <NoticeAvatar version={photoVersion} key={row.actor_id ?? row.id} name={row.actor_name} userId={row.actor_id} className="notifications-list__icon" fallback={noticeIcon(row)} />
          <span className="notifications-list__copy">{row.actor_name && <small>{row.actor_name}</small>}<strong>{row.title}</strong><span>{row.body}</span><time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString()}</time></span>
          {!row.read_at && <span className="notifications-list__unread-dot" aria-label="Unread" />}
        </button>

      </article>)}</section>
      {selected && <aside id="notification-detail" className="notifications-detail" aria-label="Notification details">
        <div key={selected.id} className="notifications-detail__content">
          <button type="button" className="notifications-detail__back" onClick={() => { setSelectedId(''); requestAnimationFrame(() => lastSelectedButton.current?.focus()); }}>← Back</button>
          <NoticeAvatar version={photoVersion} key={selected.actor_id ?? selected.id} name={selected.actor_name} userId={selected.actor_id} className="notifications-detail__icon" fallback={noticeIcon(selected)} />
          {selected.actor_name && <strong className="notifications-detail__actor">{selected.actor_name}</strong>}
          <span className={`notifications-detail__status${selected.read_at ? '' : ' is-unread'}`}>{selected.read_at ? 'Read' : 'Unread'}</span>
          <h2 ref={detailHeading} tabIndex={-1}>{selected.title}</h2><p>{selected.body}</p>
          <time dateTime={selected.created_at}>{new Date(selected.created_at).toLocaleString()}</time>
          <NotificationRecordDetail key={selected.id} eventKey={selected.event_key} area={area} />
          <div className="notifications-detail__actions">
            {!selected.read_at && <button type="button" className="button button--secondary" onClick={() => void markRead(selected.id)}>Mark as read</button>}
            <Link className="button button--primary" href={selected.href} onClick={async event => { if (selected.read_at) return; event.preventDefault(); if (await markRead(selected.id)) router.push(selected.href); }}>Open full page <Icon name="arrow" /></Link>
          </div>
        </div>
      </aside>}
    </div> : <div className="notifications-empty"><Icon name="bell" /><strong>{read === 'unread' ? 'You’re all caught up' : 'No notifications yet'}</strong><p>New updates will appear here.</p></div>}
    {count > 25 && <div className="operational-pagination"><button type="button" disabled={page===1} onClick={() => { setPage(page-1); setSelectedId(''); }}>Previous</button><span>{page} / {Math.ceil(count/25)}</span><button type="button" disabled={page*25>=count} onClick={() => { setPage(page+1); setSelectedId(''); }}>Next</button></div>}
  </div>;
}
