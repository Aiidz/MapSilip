"use client";

import { PhoneInput } from '../components/PhoneInput';
import { CloseIcon } from "../components/CloseIcon";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { MobileDetailSurface } from "../components/MobileDetailSurface";
import { ResponsiveOverlay } from "../components/ResponsiveOverlay";
import { EmptyState, PageHeader, Panel } from "../components/ui";
import dynamic from 'next/dynamic';
const BuildingMapWorkspace = dynamic(() => import('../components/BuildingMapWorkspace').then(module => module.BuildingMapWorkspace), { loading: () => <MapLoading label="Loading maintenance map…" /> });
import { MapLoading } from '../components/MapLoading';
import { ProfilePhoto, ProfilePhotoUpload } from "../components/ProfilePhoto";
import { RequestAttachment } from "../components/MaintenanceSubmissionDetails";
import { fetchOperationRows } from "../lib/workspace-loading";

const requestSummary = ["Total Requests", "Pending", "In Progress", "Urgent Requests"];
const notificationFilters = ["All", "Unread", "Read"];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '—';
}

function formatDateTime(value: unknown) {
  const date = new Date(String(value ?? ''));
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function CaretakerDashboard() {
  return <div className="caretaker-dashboard">
    <PageHeader title="Dashboard" />
    <section className="caretaker-summary" aria-label="Maintenance request summary">
      {requestSummary.map((label) => <article className="caretaker-summary__card" key={label}>
        <div><h2>{label}</h2><span aria-label="Unavailable">—</span><p>No data available</p></div>
      </article>)}
    </section>
    <Panel title="Recent Maintenance Requests" className="caretaker-panel" >
      <EmptyState title="No maintenance requests to display" description="New requests will appear here when available." icon="wrench" />
    </Panel>
  </div>;
}

export function CaretakerMaintenance({ initialRoomId }: { initialRoomId?: string }) {
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
  const [tenants, setTenants] = useState<Record<string, unknown>[]>([]);
  const [assignments, setAssignments] = useState<Record<string, unknown>[]>([]);
  const [selected,setSelected] = useState<Record<string,unknown> | null>(null);
  const [responding,setResponding] = useState(false);
  const [saveError, setSaveError] = useState('');
  const statusOptions = [
    { value: 'pending', label: 'Pending' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'resolved', label: 'Resolved' },
  ];
  const statusIndex = statusOptions.findIndex(option => option.value === selected?.status);
  const availableStatuses = statusIndex < 0 ? [] : statusOptions.slice(statusIndex);
  const canUpdate = availableStatuses.length > 0;
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    Promise.all([
      fetchOperationRows('rooms', controller.signal),
      fetchOperationRows('tenants', controller.signal).catch(() => []),
      fetchOperationRows('assignments', controller.signal).catch(() => []),
    ]).then(([roomList, people, assignmentList]) => {
      if (!active || controller.signal.aborted) return;
      setRoomNumbers(new Map(roomList.map(room => [String(room.id), String(room.room_number)])));
      setRoomFloors(new Map(roomList.map(room => [String(room.id), String(room.floor_label)])));
      setTenants(people);
      setAssignments(assignmentList);
    }).catch(() => {});
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

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
      const result = await response.json();
      setRows(result.rows);
      setCount(result.count);
      setSelected(current => result.rows.find((r: Record<string, unknown>) => r.id === current?.id) ?? null);
      setError('');
    } catch {
      setRows([]);
      setCount(0);
      setError('Maintenance requests could not be loaded.');
    }
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

  const tenantName = (tenantId: unknown, roomId: unknown) => {
    if (tenantId) {
      const profile = tenants.find(row => row.user_id === tenantId);
      if (profile?.display_name) return String(profile.display_name);
    }
    if (roomId) {
      const activeAssignment = assignments.find(row => row.room_id === roomId && !row.ended_on);
      if (activeAssignment?.tenant_id) {
        const profile = tenants.find(row => row.user_id === activeAssignment.tenant_id);
        if (profile?.display_name) return String(profile.display_name);
      }
      const roomNum = roomNumbers.get(String(roomId));
      if (roomNum) return `Room ${roomNum} Resident`;
    }
    return 'Resident submission';
  };

  const roomLabel = (roomId: unknown) => {
    const roomNum = roomNumbers.get(String(roomId));
    return roomNum ? `Room ${roomNum}` : '';
  };

  const roomOptions = [...new Set(roomFloors.values())].filter(Boolean).sort((a,b) => a.localeCompare(b,undefined,{numeric:true}));
  const visibleRows = rows.filter(row => {
    const room = roomNumbers.get(String(row.room_id)) ?? '';
    return (!roomFilter || roomFloors.get(String(row.room_id)) === roomFilter) && (!query || room.toLowerCase().includes(query.trim().toLowerCase()));
  });

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !canUpdate || busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true);
    setSaveError('');
    try {
      const response = await fetch('/api/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'maintenance.update',
          data: { id: selected.id, status: fields.get('status'), response: fields.get('response') }
        })
      });
      if (!response.ok) {
        setSaveError(response.status === 400
          ? 'This request may have changed. Close this form and refresh the list before trying again.'
          : response.status === 403
            ? 'You don’t have permission to update this request.'
            : 'Could not save the maintenance update. Try again.');
        return;
      }
      form.reset();
      setResponding(false);
      await load();
      setSummaryVersion(version => version + 1);
    } catch {
      setSaveError('Could not save the maintenance update. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="caretaker-workspace maintenance-workspace">
    <PageHeader title="Maintenance Heatmap" description="Monitor room maintenance activity and repair requests."
      action={<button className="dashboard-export room-management__export" type="button" disabled><Icon name="download" />Export Report</button>} />
    <section className="caretaker-summary caretaker-list-summary" aria-label="Maintenance request summary">
      {([['Total Requests',count,'Recorded repairs'],['Pending',statusCounts?.pending,'Awaiting action'],['In Progress',statusCounts?.in_progress,'Being handled'],['Urgent Requests',null,'Priority not tracked']] as const).map(([label,value,description]) => <article className="caretaker-summary__card" key={label}>
        <div><h2>{label}</h2><span>{value ?? '—'}</span><p>{description}</p></div>
      </article>)}
    </section>
    <div className="room-tabs caretaker-view-tabs" role="group" aria-label="Maintenance view">
      <button type="button" className={view === 'building' ? 'is-active' : ''} aria-pressed={view === 'building'} onClick={() => setView('building')}><Icon name="building" />2D Heatmap</button>
      <button type="button" className={view === 'list' ? 'is-active' : ''} aria-pressed={view === 'list'} onClick={() => setView('list')}><Icon name="wrench" />Maintenance List</button>
    </div>
    {view === 'building' ? <BuildingMapWorkspace role="caretaker" mode="maintenance" initialSelectedRoomId={initialRoomId} onViewRequests={() => setView('list')} /> : <>
    <div className="caretaker-maintenance-layout concerns-maintenance-layout">
      <div className="caretaker-request-list concerns-request-list">
        <div className="caretaker-room-tools concerns-tools">
          <div className="tenant-list-filter concerns-filter" ref={roomFilterRef} onKeyDown={event => { if (event.key === 'Escape') { setRoomFilterOpen(false);roomFilterRef.current?.querySelector<HTMLButtonElement>('.tenant-list-filter__trigger')?.focus(); } }}>
            <button type="button" className="tenant-list-filter__trigger" aria-label="Filter requests by floor" aria-haspopup="listbox" aria-expanded={roomFilterOpen} aria-controls="maintenance-room-filter-options" onClick={() => setRoomFilterOpen(open => !open)}>
              <Icon name={roomFilter ? 'map' : 'users'} /><span>{roomFilter || 'All Rooms'}</span><Icon name="chevron" className="tenant-list-filter__chevron" />
            </button>
            {roomFilterOpen && <div className="tenant-list-filter__menu concerns-filter__menu" id="maintenance-room-filter-options" role="listbox" aria-label="Filter requests by floor">
              {[{value:'',label:'All Rooms'},...roomOptions.map(floor=>({value:floor,label:floor}))].map(option=><button type="button" role="option" aria-selected={roomFilter===option.value} className={roomFilter===option.value?'is-selected':''} key={option.value} onClick={() => {setRoomFilter(option.value);setRoomFilterOpen(false);}}>
                <Icon name={option.value?'map':'users'} /><span>{option.label}</span>{roomFilter===option.value && <span className="tenant-list-filter__check" aria-hidden="true">✓</span>}
              </button>)}
            </div>}
          </div>
          <label className="caretaker-search"><Icon name="search" /><span className="sr-only">Search rooms</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search room…" /></label>
        </div>
        {error && <p role="alert">{error} <button type="button" onClick={() => void load()}>Retry</button></p>}
        {visibleRows.length ? <div className="caretaker-recent-list concerns-recent-list">{visibleRows.map(row => {
          const room = roomLabel(row.room_id);
          const rowStatus = String(row.status);
          return <button className={`caretaker-request-row concerns-request-row${selected?.id === row.id ? ' is-selected' : ''}`} type="button" key={String(row.id)} onClick={() => {setSelected(row);setResponding(false);}}>
            <span className="caretaker-request-row__top">
              <strong>{String(row.category)}</strong>
              <span className={`concern-status-badge concern-status-badge--${rowStatus}`}>{rowStatus.replaceAll('_', ' ')}</span>
            </span>
            <span className="caretaker-request-row__bottom">
              <span>{room || 'Room not specified'}</span>
              <time dateTime={String(row.created_at)}>{new Date(String(row.created_at)).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</time>
            </span>
          </button>;
        })}</div> : <EmptyState title="No requests to display" description={query || roomFilter ? "No requests match this room." : "Maintenance requests will appear here."} icon="wrench" />}
        {count > 100 && <div className="operational-pagination"><button type="button" disabled={page===1} onClick={() => { setPage(page-1);setSelected(null); }}>Previous</button><span>{page} / {Math.ceil(count/100)}</span><button type="button" disabled={page*100>=count} onClick={() => { setPage(page+1);setSelected(null); }}>Next</button></div>}
      </div>
      <MobileDetailSurface open={Boolean(selected)} onClose={() => setSelected(null)} title="Maintenance Details">
        <Panel
          title="Maintenance Details"
          headerAction={selected && (
            <button type="button" className="detail-header__close" aria-label="Clear selected request" onClick={() => setSelected(null)}>
              <CloseIcon />
            </button>
          )}
          className="caretaker-request-details concerns-details-panel"
        >
          {selected ? (
            <div className="caretaker-selected-details concerns-details">
              <div className="concern-detail-header">
                <div className="concern-detail-identity">
                  <ProfilePhoto
                    key={String(selected.tenant_id ?? selected.id)}
                    className="concern-tenant-avatar"
                    userId={selected.tenant_id ? String(selected.tenant_id) : undefined}
                    fallback={initials(tenantName(selected.tenant_id, selected.room_id))}
                  />
                  <div className="concern-detail-identity__meta">
                    <div className="concern-detail-identity__title">
                      <strong>{tenantName(selected.tenant_id, selected.room_id)}</strong>
                      {roomLabel(selected.room_id) && <span className="concern-room-pill">{roomLabel(selected.room_id)}</span>}
                    </div>
                    <div className="concern-detail-identity__sub">
                      <span className="concern-category-tag"><Icon name="wrench" />{String(selected.category ?? 'General')}</span>
                      <span className="concern-date-tag">Submitted {formatDateTime(selected.created_at)}</span>
                    </div>
                  </div>
                </div>
                <div className="concern-detail-header__actions">
                  <span className={`concern-status-badge concern-status-badge--${String(selected.status)}`}>
                    {String(selected.status).replaceAll('_', ' ')}
                  </span>
                </div>
              </div>

              <div className="concern-body-thread">
                <section className="concern-thread-card concern-thread-card--resident" aria-label="Maintenance request">
                  <div className="concern-thread-card__header">
                    <span className="concern-thread-card__label">Maintenance Request</span>
                    <time className="concern-thread-card__time">{formatDateTime(selected.created_at)}</time>
                  </div>
                  <p className="concern-thread-card__content">{String(selected.description || 'No description provided.')}</p>
                  {Boolean(selected.attachment_id) && (
                    <div className="maintenance-thread-attachment">
                      <RequestAttachment key={String(selected.attachment_id)} id={String(selected.attachment_id)} />
                    </div>
                  )}
                </section>

                {Boolean(selected.staff_response) ? (
                  <section className="concern-thread-card concern-thread-card--management" aria-label="Staff update">
                    <div className="concern-thread-card__header">
                      <span className="concern-thread-card__label">
                        <span className="concern-thread-card__badge-check" aria-hidden="true">✓</span> Staff Update
                      </span>
                      {Boolean(selected.updated_at) && <time className="concern-thread-card__time">{formatDateTime(selected.updated_at)}</time>}
                    </div>
                    <p className="concern-thread-card__content">{String(selected.staff_response)}</p>
                    {canUpdate && <div className="concern-thread-card__footer">
                      <button type="button" className="button button--secondary concern-thread-edit-button" onClick={() => { setSaveError(''); setResponding(true); }}>
                        Update Request
                      </button>
                    </div>}
                  </section>
                ) : canUpdate ? (
                  <div className="concern-empty-response-prompt">
                    <div className="concern-empty-response-prompt__info">
                      <strong>Awaiting Repair Action</strong>
                      <p>Review this maintenance issue and provide an update or status change.</p>
                    </div>
                    <button type="button" className="button button--primary concern-respond-cta" onClick={() => { setSaveError(''); setResponding(true); }}>
                      Update Request
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <EmptyState title="No request selected" description="Select a maintenance request from the list to view its details." icon="wrench" />
          )}
        </Panel>
      </MobileDetailSurface>
    </div>
    <ResponsiveOverlay
      open={responding && canUpdate}
      dismissible={!busy}
      onClose={() => setResponding(false)}
      title="Update maintenance request"
      className="request-response-overlay"
      description={selected ? `${String(selected.category)} · ${roomNumbers.get(String(selected.room_id)) ? `Room ${roomNumbers.get(String(selected.room_id))}` : 'Room —'}` : undefined}
      variant="dialog"
    >
      {selected && (
        <form key={String(selected.id)} className="operational-form caretaker-response-form concerns-response-form" onSubmit={update}>
          <div className="concerns-modal-original">
            <span className="concerns-modal-original__label">Resident Request</span>
            <p className="concerns-original">{String(selected.description || 'No description provided.')}</p>
          </div>
          <label>
            Update status
            <select name="status" defaultValue={String(selected.status)}>
              {availableStatuses.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            Repair note or progress update
            <textarea
              name="response"
              defaultValue={selected.staff_response ? String(selected.staff_response) : ''}
              maxLength={2000}
              rows={4}
              placeholder="Add repair notes, vendor details, or completion updates…"
            />
          </label>
          {saveError && <p role="alert">{saveError}</p>}
          <div className="concerns-modal-actions">
            <button type="button" className="button button--secondary" disabled={busy} onClick={() => setResponding(false)}>Cancel</button>
            <button type="submit" className="button button--primary" disabled={busy || !canUpdate}>{busy ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </form>
      )}
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
    <PageHeader title="Notifications" />
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
  return <label className="caretaker-profile-field"><span>{label}</span>{type === "tel" ? <PhoneInput placeholder="Not provided" disabled={disabled} /> : <input type={type} placeholder="Not provided" disabled={disabled} autoComplete="off" />}</label>;
}

export function CaretakerProfile() {
  const [editing, setEditing] = useState(false);
  function preventSave(event: FormEvent<HTMLFormElement>) { event.preventDefault(); }
  return <div className="caretaker-workspace caretaker-profile">
    <PageHeader title="Profile Settings" />
    <div className="caretaker-profile-grid">
      <div className="caretaker-profile-forms">
        <Panel title="Personal Information" icon="users">
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
        <Panel title="Change Password" icon="shield">
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
