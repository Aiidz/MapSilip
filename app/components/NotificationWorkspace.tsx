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

function notificationDestination(notice: Notice, area: Area) {
  const concern = /^concern:([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}):/i.exec(notice.event_key);
  return concern && (area === 'tenant' || area === 'management')
    ? `/${area}/concerns?recordId=${encodeURIComponent(concern[1])}`
    : notice.href;
}

type NoticeCategory = '' | 'payments' | 'maintenance' | 'concerns' | 'accounts' | 'visits';

const noticeCategories: { id: NoticeCategory; label: string }[] = [
  { id: '', label: 'All' },
  { id: 'payments', label: 'Payments' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'concerns', label: 'Concerns' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'visits', label: 'Visits' },
];

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function noticeDayLabel(value: string, now = new Date()) {
  const date = new Date(value);
  const daysAgo = Math.round((startOfLocalDay(now) - startOfLocalDay(date)) / 86_400_000);
  if (daysAgo <= 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  if (daysAgo < 7) return new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date);
  return new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' }).format(date);
}

function noticeTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function groupNoticesByDay(rows: Notice[]) {
  const groups: { label: string; rows: Notice[] }[] = [];
  for (const row of rows) {
    const label = noticeDayLabel(row.created_at);
    const group = groups[groups.length - 1];
    if (group?.label === label) group.rows.push(row);
    else groups.push({ label, rows: [row] });
  }
  return groups;
}

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
  const [category,setCategory] = useState<NoticeCategory>('');
  const [selectedId,setSelectedId] = useState('');
  const [openingNotificationId,setOpeningNotificationId] = useState('');
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
      const params = new URLSearchParams({ resource:'notifications',page:String(page),search:query,read,category });
      const response = await fetch(`/api/operations?${params}`, { signal: request.signal });
      if (!response.ok) throw new Error();
      const result = await response.json(); if (!request.isCurrent()) return; setRows(result.rows);setCount(result.count);setPhotoVersion(Date.now());setError('');
    } catch { if (!request.isCurrent()) return; setError('Notifications could not be loaded.'); }
    finally { if (request.isCurrent()) setLoading(false); }
  },[page,query,read,category]);
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
  async function markUnread(id:string) {
    try {
      const response = await fetch('/api/operations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'notification.unread',data:{id}})});
      if (!response.ok) throw new Error();
      setRows(current => current.map(row => row.id === id ? {...row,read_at:null} : row));
      window.dispatchEvent(new Event('mapsilip-notifications-updated'));
    } catch { setError('Notification could not be marked unread.'); }
  }
  async function openMaintenanceRoom(row: Notice) {
    const requestId = /^maintenance:([0-9a-f-]{36}):/i.exec(row.event_key)?.[1];
    if (!requestId) { setSelectedId(row.id); return; }
    setOpeningNotificationId(row.id);
    setError('');
    try {
      const response = await fetch(`/api/operations?${new URLSearchParams({ resource:'maintenance',recordId:requestId })}`);
      if (!response.ok) throw new Error();
      const result = await response.json() as { rows?: { room_id?: string | null }[] };
      const roomId = result.rows?.[0]?.room_id;
      if (!roomId) throw new Error();
      await markRead(row.id);
      const path = area === 'management' ? '/management/maintenance' : '/caretaker/maintenance';
      router.push(`${path}?view=building&roomId=${encodeURIComponent(roomId)}`);
    } catch {
      setError('The room for this request could not be opened.');
      setSelectedId(row.id);
    } finally { setOpeningNotificationId(''); }
  }
  function selectNotification(row: Notice, button: HTMLButtonElement) {
    lastSelectedButton.current = button;
    setSelectedId(row.id);
    if (!row.read_at) void markRead(row.id);
  }
  const selected = rows.find(row => row.id === selectedId) ?? null;
  const groups = groupNoticesByDay(rows);
  return <div className={`notifications-workspace${selected ? ' has-selection' : ''}`}><PageHeader title="Notifications" action={<Link className="button button--secondary" href={`/${area}/settings?section=notifications`}><Icon name="settings" />Settings</Link>} />
    <label className="notifications-search"><Icon name="search" /><span className="sr-only">Search notifications</span>
      <input type="search" placeholder="Search notifications..." value={query} onChange={event => { setQuery(event.target.value);setPage(1);setSelectedId(''); }} /></label>
    <div className="notifications-filters" role="group" aria-label="Filter notifications">
      {noticeCategories.map(({ id, label }) => <button type="button" key={id || 'all'}
        aria-pressed={category===id} className={category===id ? 'is-active' : ''}
        onClick={() => { setCategory(id);setPage(1);setSelectedId(''); }}>{label}</button>)}
      <button type="button" aria-pressed={read==='unread'} className={`notifications-filters__unread${read==='unread' ? ' is-active' : ''}`}
        onClick={() => { setRead(current => current === 'unread' ? '' : 'unread');setPage(1);setSelectedId(''); }}>Unread only</button>
    </div>
    {error && <p role="alert">{error} <button type="button" onClick={() => void load()}>Retry</button></p>}
    {loading && !rows.length ? <DataSkeleton label="Loading notifications" /> : rows.length ? <div className={`notifications-workspace__split${selected ? ' has-selection' : ''}`}>
      <section className="notifications-list" aria-label="Notification list">{groups.map(group => <section className="notifications-list__group" key={group.label} aria-label={group.label}>
        <h2 className="notifications-list__day">{group.label}</h2>
        {group.rows.map(row => <article key={row.id} className={`notifications-list__item${row.read_at ? '' : ' is-unread'}${selectedId === row.id ? ' is-selected' : ''}`}>
        <button type="button" className="notifications-list__select" aria-pressed={selectedId === row.id} aria-controls="notification-detail" aria-busy={openingNotificationId === row.id} disabled={Boolean(openingNotificationId)} onClick={event => selectNotification(row, event.currentTarget)}>
          <NoticeAvatar version={photoVersion} key={row.actor_id ?? row.id} name={row.actor_name} userId={row.actor_id} className="notifications-list__icon" fallback={noticeIcon(row)} />
          <span className="notifications-list__copy"><span className="notifications-list__main"><strong>{row.title}</strong>{row.actor_name && <small>{row.actor_name}</small>}<span>{row.body}</span></span><time dateTime={row.created_at} title={new Date(row.created_at).toLocaleString()}>{noticeTime(row.created_at)}</time></span>
          {!row.read_at && <span className="notifications-list__unread-dot" aria-label="Unread" />}
        </button>

      </article>)}</section>)}</section>
      {selected && <aside id="notification-detail" className="notifications-detail" aria-label="Notification details">
        <div key={selected.id} className="notifications-detail__content">
          <button type="button" className="notifications-detail__back" onClick={() => { setSelectedId(''); requestAnimationFrame(() => lastSelectedButton.current?.focus()); }}>← Back</button>
          <div className="notifications-detail__sender">
            <NoticeAvatar version={photoVersion} name={selected.actor_name} userId={selected.actor_id} className="notifications-detail__icon" fallback={noticeIcon(selected)} />
            {selected.actor_name && <strong className="notifications-detail__actor">{selected.actor_name}</strong>}
            <span className={`notifications-detail__status${selected.read_at ? '' : ' is-unread'}`}>{selected.read_at ? 'Read' : 'Unread'}</span>
          </div>
          <h2 ref={detailHeading} tabIndex={-1}>{selected.title}</h2><p>{selected.body}</p>
          <time dateTime={selected.created_at}>{new Date(selected.created_at).toLocaleString()}</time>
          <NotificationRecordDetail eventKey={selected.event_key} />
          <div className="notifications-detail__actions">
            {selected.read_at && <button type="button" className="button button--secondary" onClick={() => void markUnread(selected.id)}>Mark as unread</button>}
            <Link className="button button--primary" href={notificationDestination(selected, area)} aria-busy={openingNotificationId === selected.id} onClick={async event => {
              if (openingNotificationId) { event.preventDefault(); return; }
              if (area !== 'tenant' && selected.event_key.startsWith('maintenance:')) {
                event.preventDefault();
                await openMaintenanceRoom(selected);
                return;
              }
              if (selected.read_at) return;
              event.preventDefault();
              await markRead(selected.id);
              router.push(notificationDestination(selected, area));
            }}>{openingNotificationId === selected.id ? 'Opening…' : 'Open full page'} <Icon name="arrow" /></Link>
          </div>
        </div>
      </aside>}
    </div> : <div className="notifications-empty"><Icon name="bell" /><strong>{read === 'unread' ? 'You’re all caught up' : 'No notifications yet'}</strong><p>New updates will appear here.</p></div>}
    {count > 25 && <div className="operational-pagination"><button type="button" disabled={page===1} onClick={() => { setPage(page-1); setSelectedId(''); }}>Previous</button><span>{page} / {Math.ceil(count/25)}</span><button type="button" disabled={page*25>=count} onClick={() => { setPage(page+1); setSelectedId(''); }}>Next</button></div>}
  </div>;
}
