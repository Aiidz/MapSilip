"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { ResponsiveOverlay } from "../components/ResponsiveOverlay";
import { EmptyState, PageHeader, Panel } from "../components/ui";
import dynamic from 'next/dynamic';
const BuildingMapWorkspace = dynamic(() => import('../components/BuildingMapWorkspace').then(module => module.BuildingMapWorkspace), { loading: () => <div role="status" className="map-loading">Loading maintenance map…</div> });
import { ProfilePhoto, ProfilePhotoUpload } from "../components/ProfilePhoto";

const requestSummary = ["Total Requests", "Pending", "In Progress", "Urgent Requests"];
const notificationFilters = ["All", "Unread", "Read"];

export function CaretakerDashboard() {
  return <div className="caretaker-dashboard">
    <PageHeader title="Dashboard" description="Monitor and respond to tenant maintenance requests." />
    <section className="caretaker-summary" aria-label="Maintenance request summary">
      {requestSummary.map((label) => <article className="caretaker-summary__card" key={label}>
        <div><h2>{label}</h2><span aria-label="Unavailable">—</span><p>No data available</p></div>
        <span className="caretaker-summary__icon" aria-hidden="true"><Icon name="arrow" /></span>
      </article>)}
    </section>
    <Panel title="Recent Maintenance Requests" className="caretaker-panel" >
      <EmptyState title="No maintenance requests to display" description="New requests will appear here when available." icon="wrench" />
    </Panel>
  </div>;
}

export function CaretakerMaintenance() {
  const [view, setView] = useState<'building' | 'list'>('building');
  const [query, setQuery] = useState("");
  const [roomFilter, setRoomFilter] = useState('');
  const [roomFilterOpen,setRoomFilterOpen] = useState(false);
  const roomFilterRef = useRef<HTMLDivElement>(null);
  const [page,setPage] = useState(1);
  const [count,setCount] = useState(0);
  const [statusCounts,setStatusCounts] = useState<{ pending:number; in_progress:number } | null>(null);
  const [summaryVersion,setSummaryVersion] = useState(0);
  const [rows,setRows] = useState<Record<string,unknown>[]>([]);
  const [roomNumbers,setRoomNumbers] = useState<Map<string,string>>(new Map());
  const [roomFloors,setRoomFloors] = useState<Map<string,string>>(new Map());
  const [selected,setSelected] = useState<Record<string,unknown> | null>(null);
  const [responding,setResponding] = useState(false);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch('/api/operations?resource=rooms&pageSize=100');
        if (!response.ok) return;
        const result = await response.json();
        const roomPages = await Promise.all(Array.from({length:Math.max(0,Math.ceil(result.count/100)-1)},(_,index) =>
          fetch(`/api/operations?resource=rooms&pageSize=100&page=${index+2}`).then(page => {
            if (!page.ok) throw new Error('Room page unavailable');
            return page.json();
          })));
        if (active) {
          const rooms = [result,...roomPages].flatMap(page => page.rows) as Record<string,unknown>[];
          setRoomNumbers(new Map(rooms.map(room => [String(room.id),String(room.room_number)])));
          setRoomFloors(new Map(rooms.map(room => [String(room.id),String(room.floor_label)])));
        }
      } catch { /* Request cards remain usable if room labels are unavailable. */ }
    })();
    return () => { active = false; };
  },[]);
  useEffect(() => {
    function closeMenu(event: PointerEvent) {
      if (!roomFilterRef.current?.contains(event.target as Node)) setRoomFilterOpen(false);
    }
    document.addEventListener('pointerdown',closeMenu);
    return () => document.removeEventListener('pointerdown',closeMenu);
  },[]);
  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ resource:'maintenance',page:String(page),pageSize:'100' });
      const response = await fetch(`/api/operations?${params}`);
      if (!response.ok) throw new Error();
      const result = await response.json();setRows(result.rows);setCount(result.count);setError('');
    } catch { setRows([]);setCount(0);setError('Maintenance requests could not be loaded.'); }
  },[page]);
  useEffect(() => { const timer=window.setTimeout(() => void load(),150);return () => window.clearTimeout(timer); },[load]);
  useEffect(() => {
    let active = true;
    void Promise.all((['pending','in_progress'] as const).map(async status => {
      const response = await fetch(`/api/operations?resource=maintenance&status=${status}&pageSize=1`);
      if (!response.ok) throw new Error('Summary unavailable');
      return [status,Number((await response.json()).count)] as const;
    })).then(entries => { if (active) setStatusCounts(Object.fromEntries(entries) as { pending:number; in_progress:number }); })
      .catch(() => { if (active) setStatusCounts(null); });
    return () => { active = false; };
  },[summaryVersion]);
  const roomOptions = [...new Set(roomFloors.values())].filter(Boolean).sort((a,b) => a.localeCompare(b,undefined,{numeric:true}));
  const visibleRows = rows.filter(row => {
    const room = roomNumbers.get(String(row.room_id)) ?? '';
    return (!roomFilter || roomFloors.get(String(row.room_id)) === roomFilter) && (!query || room.toLowerCase().includes(query.trim().toLowerCase()));
  });
  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();if (!selected || busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true);
    try { const response = await fetch('/api/operations',{ method:'POST',headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ action:'maintenance.update',data:{ id:selected.id,status:fields.get('status'),response:fields.get('response') } }) });
      if (!response.ok) throw new Error(); form.reset(); setSelected(null);setResponding(false);await load();setSummaryVersion(version => version+1); }
    catch { setError('The maintenance update could not be saved.'); }
    finally { setBusy(false); }
  }
  return <div className="caretaker-workspace maintenance-workspace">
    <PageHeader title="Maintenance Heatmap" description="Monitor room maintenance activity and repair requests." />
    <section className="caretaker-summary caretaker-list-summary" aria-label="Maintenance request summary">
      {([['Total Requests',count,'Recorded repairs'],['Pending',statusCounts?.pending,'Awaiting action'],['In Progress',statusCounts?.in_progress,'Being handled'],['Urgent Requests',null,'Priority not tracked']] as const).map(([label,value,description]) => <article className="caretaker-summary__card" key={label}>
        <div><h2>{label}</h2><span>{value ?? '—'}</span><p>{description}</p></div><span className="caretaker-summary__icon" aria-hidden="true"><Icon name="arrow" /></span>
      </article>)}
    </section>
    <div className="room-tabs caretaker-view-tabs" role="group" aria-label="Maintenance view">
      <button type="button" className={view === 'building' ? 'is-active' : ''} aria-pressed={view === 'building'} onClick={() => setView('building')}><Icon name="building" />2D Heatmap</button>
      <button type="button" className={view === 'list' ? 'is-active' : ''} aria-pressed={view === 'list'} onClick={() => setView('list')}><Icon name="wrench" />Maintenance List</button>
    </div>
    {view === 'building' ? <BuildingMapWorkspace role="caretaker" mode="maintenance" onViewRequests={() => setView('list')} /> : <>
    <div className="caretaker-maintenance-layout">
      <div className="caretaker-request-list">
        <div className="caretaker-room-tools">
          <div className="tenant-list-filter" ref={roomFilterRef} onKeyDown={event => { if (event.key === 'Escape') { setRoomFilterOpen(false);roomFilterRef.current?.querySelector<HTMLButtonElement>('.tenant-list-filter__trigger')?.focus(); } }}>
            <button type="button" className="tenant-list-filter__trigger" aria-label="Filter requests by floor" aria-haspopup="listbox" aria-expanded={roomFilterOpen} aria-controls="maintenance-room-filter-options" onClick={() => setRoomFilterOpen(open => !open)}>
              <Icon name={roomFilter ? 'map' : 'users'} /><span>{roomFilter || 'All Rooms'}</span><Icon name="chevron" className="tenant-list-filter__chevron" />
            </button>
            {roomFilterOpen && <div className="tenant-list-filter__menu" id="maintenance-room-filter-options" role="listbox" aria-label="Filter requests by floor">
              {[{value:'',label:'All Rooms'},...roomOptions.map(floor=>({value:floor,label:floor}))].map(option=><button type="button" role="option" aria-selected={roomFilter===option.value} className={roomFilter===option.value?'is-selected':''} key={option.value} onClick={() => {setRoomFilter(option.value);setRoomFilterOpen(false);}}>
                <Icon name={option.value?'map':'users'} /><span>{option.label}</span>{roomFilter===option.value && <span className="tenant-list-filter__check" aria-hidden="true">✓</span>}
              </button>)}
            </div>}
          </div>
          <label className="caretaker-search"><Icon name="search" /><span className="sr-only">Search rooms</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search room…" /></label>
        </div>
        {error && <p role="alert">{error} <button type="button" onClick={() => void load()}>Retry</button></p>}
        {visibleRows.length ? <div className="caretaker-recent-list">{visibleRows.map(row => <button className="caretaker-request-row" type="button" key={String(row.id)} onClick={() => {setSelected(row);setResponding(false);}}>
          <span className="caretaker-request-row__top"><strong>{String(row.category)}</strong><span className={`caretaker-request-row__status caretaker-request-row__status--${String(row.status)}`}>{String(row.status).replaceAll('_',' ')}</span></span>
          <span className="caretaker-request-row__bottom"><span>Room {roomNumbers.get(String(row.room_id)) ?? '—'}</span><time dateTime={String(row.created_at)}>{new Date(String(row.created_at)).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</time></span>
        </button>)}</div> : <EmptyState title="No requests to display" description={query || roomFilter ? "No requests match this room." : "Maintenance requests will appear here."} icon="wrench" />}
        {count > 100 && <div className="operational-pagination"><button type="button" disabled={page===1} onClick={() => { setPage(page-1);setSelected(null); }}>Previous</button><span>{page} / {Math.ceil(count/100)}</span><button type="button" disabled={page*100>=count} onClick={() => { setPage(page+1);setSelected(null); }}>Next</button></div>}
      </div>
      <Panel title="Maintenance Details" className="caretaker-request-details">
        {selected ? <div className="caretaker-selected-details">
          <>
            <button type="button" className="caretaker-details-close" aria-label="Close maintenance details" onClick={() => setSelected(null)}>×</button>
            <h3>Request Information</h3>
            <div className="caretaker-details-grid">
              <p><small>Repair Category</small><strong>{String(selected.category)}</strong></p>
              <p><small>Room Location</small><strong>{roomNumbers.get(String(selected.room_id)) ? `Room ${roomNumbers.get(String(selected.room_id))}` : 'Room —'}</strong></p>
              <p><small>Reported By</small><strong>Unavailable</strong></p>
              <p><small>Date Reported</small><strong>{new Date(String(selected.created_at)).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</strong></p>
              <p><small>Status</small><strong><span className={`caretaker-request-row__status caretaker-request-row__status--${String(selected.status)}`}>{String(selected.status).replaceAll('_',' ')}</span></strong></p>
              <p><small>Priority Level</small><strong>Not tracked</strong></p>
            </div>
            <div className="caretaker-details-description-block"><span>Description</span><p>{String(selected.description)}</p></div>
            <div className="caretaker-details-photo"><span>Reported Photo</span>{selected.attachment_id ? <a href={`/api/attachments?id=${encodeURIComponent(String(selected.attachment_id))}`}>View attached photo</a> : <p><svg className="caretaker-photo-placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8" cy="9" r="1.5" /><path d="m4 17 5-5 4 4 3-3 4 4" /></svg>No photo attached</p>}</div>
            <div className="caretaker-details-history"><strong>Update History</strong>
              {Boolean(selected.staff_response) && <div><b>Latest update</b><p>{String(selected.staff_response)}</p>{Boolean(selected.updated_at) && <time dateTime={String(selected.updated_at)}>{new Date(String(selected.updated_at)).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})}</time>}</div>}
              <div><b>Request created</b><time dateTime={String(selected.created_at)}>{new Date(String(selected.created_at)).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})}</time></div>
            </div>
            {selected.status !== 'resolved' && <button type="button" className="button button--secondary" onClick={() => setResponding(true)}>Respond</button>}
          </>
        </div> : <EmptyState title="No request selected" description="Select a maintenance request to view its details." icon="fileSearch" />}
      </Panel>
    </div>
    <ResponsiveOverlay
      open={responding && Boolean(selected)}
      onClose={() => setResponding(false)}
      title="Update maintenance request"
      description={selected ? `${String(selected.category)} · ${roomNumbers.get(String(selected.room_id)) ? `Room ${roomNumbers.get(String(selected.room_id))}` : 'Room —'}` : undefined}
      variant="dialog"
    >
      {selected && <form key={String(selected.id)} className="operational-form caretaker-response-form" onSubmit={update}>
        <label>Note<textarea name="response" maxLength={2000} rows={3} placeholder="Add repair notes or progress updates…" /></label>
        <label>Update status<select name="status" defaultValue={selected.status==='pending'?'in_progress':'resolved'}>
          {selected.status==='pending' ? <option value="in_progress">In Progress</option> : <option value="resolved">Resolved</option>}</select></label>
        <div><button className="button button--primary" disabled={busy}>{busy ? 'Saving…' : 'Save Changes'}</button><button type="button" className="button button--secondary" onClick={() => setResponding(false)}>Cancel</button></div>
      </form>}
    </ResponsiveOverlay>
    </>}
  </div>;
}

export function CaretakerNotifications() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [rows,setRows] = useState<Record<string,unknown>[]>([]);
  const [error,setError] = useState('');
  const load = useCallback(async () => {
    try { const response = await fetch(`/api/operations?resource=notifications&search=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error();setRows((await response.json()).rows);setError(''); }
    catch { setError('Notifications could not be loaded.'); }
  },[query]);
  useEffect(() => { const timer=window.setTimeout(() => void load(),150);return () => window.clearTimeout(timer); },[load]);
  async function markRead(id: unknown) {
    const response = await fetch('/api/operations',{ method:'POST',headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ action:'notification.read',data:{ id } }) });
    if (response.ok) void load(); else setError('Notification could not be marked read.');
  }
  const visible = rows.filter(row => filter==='All' || (filter==='Read' ? Boolean(row.read_at) : !row.read_at));
  return <div className="caretaker-workspace">
    <PageHeader title="Notifications" description="Updates about maintenance requests and account activity." />
    <div className="caretaker-notification-tools">
      <label className="caretaker-search">
        <Icon name="search" />
        <span className="sr-only">Search notifications</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notifications" />
      </label>
      <div className="caretaker-filters" role="group" aria-label="Filter notifications">
        {notificationFilters.map((item) => <button type="button" key={item} aria-pressed={filter === item} className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>{item}</button>)}
      </div>
    </div>
    <Panel title="Recent Notifications" className="caretaker-panel">
      {error && <p role="alert">{error} <button type="button" onClick={() => void load()}>Retry</button></p>}
      {visible.length ? <div className="caretaker-recent-list">{visible.map(row => <article className="caretaker-notification-row" key={String(row.id)}>
        <a href={String(row.href)}><strong>{String(row.title)}</strong><span>{String(row.body)}</span></a>
        {!row.read_at && <button type="button" onClick={() => void markRead(row.id)}>Mark read</button>}
      </article>)}</div> : <EmptyState title="No notifications to display" description={query ? "No matching notifications are available." : "New notifications will appear here."} icon="bell" />}
    </Panel>
  </div>;
}

function ProfileField({ label, type = "text", disabled = false }: { label: string; type?: string; disabled?: boolean }) {
  return <label className="caretaker-profile-field"><span>{label}</span><input type={type} placeholder="Not provided" disabled={disabled} autoComplete="off" /></label>;
}

export function CaretakerProfile() {
  const [editing, setEditing] = useState(false);
  function preventSave(event: FormEvent<HTMLFormElement>) { event.preventDefault(); }
  return <div className="caretaker-workspace caretaker-profile">
    <PageHeader title="Profile Settings" description="Manage your account information and security." />
    <div className="caretaker-profile-grid">
      <div className="caretaker-profile-forms">
        <Panel title="Personal Information" description="Update your personal and contact details." icon="users">
          <form className="caretaker-profile-form" onSubmit={preventSave}>
            <ProfileField label="First name" disabled={!editing} />
            <ProfileField label="Email address" type="email" disabled={!editing} />
            <ProfileField label="Middle name" disabled={!editing} />
            <ProfileField label="Contact number" type="tel" disabled={!editing} />
            <ProfileField label="Last name" disabled={!editing} />
            <div className="caretaker-profile-actions">
              <button className="button button--secondary" type="button" onClick={() => setEditing((current) => !current)}>{editing ? "Cancel edit" : "Edit information"}</button>
              <button className="button button--primary" type="submit" disabled>Save changes</button>
            </div>
          </form>
        </Panel>
        <Panel title="Change Password" description="Update your password to keep your account secure." icon="shield">
          <form className="caretaker-profile-form caretaker-password-form" onSubmit={preventSave}>
            <ProfileField label="Current password" type="password" />
            <ProfileField label="New password" type="password" />
            <ProfileField label="Confirm password" type="password" />
            <div className="caretaker-profile-actions"><button className="button button--secondary" type="submit" disabled>Update password</button></div>
          </form>
        </Panel>
      </div>
      <aside className="caretaker-profile-summary">
        <ProfilePhoto className="caretaker-profile-avatar" fallback="C" />
        <strong>Caretaker account</strong>
        <dl><div><dt>Account role</dt><dd>Caretaker</dd></div><div><dt>Account details</dt><dd>Unavailable</dd></div></dl>
        <ProfilePhotoUpload />
      </aside>
    </div>
  </div>;
}
