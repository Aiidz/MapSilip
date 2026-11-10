'use client';

import { DataSkeleton } from './DataSkeleton';

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Icon } from './Icon';
import { ResponsiveOverlay } from './ResponsiveOverlay';
import dynamic from 'next/dynamic';
const BuildingMapWorkspace = dynamic(() => import('./BuildingMapWorkspace').then(module => module.BuildingMapWorkspace), { loading: () => <DataSkeleton label="Loading dormitory view" variant="chart" /> });
import { PageHeader } from './ui';
import type { BuildingRoom } from '../lib/building-map.mjs';

type Row = Record<string,unknown>;
type View = 'map' | 'tenants';
const value = (item: unknown) => item == null || item === '' ? '—' : String(item);
const formatPhp = (amount: unknown) => Number.isFinite(Number(amount))
  ? new Intl.NumberFormat('en-PH',{ style:'currency',currency:'PHP',maximumFractionDigits:0 }).format(Number(amount)) : '—';
const formatMonth = (timestamp: unknown) => timestamp ? new Intl.DateTimeFormat('en-PH',{ month:'short',year:'numeric',timeZone:'Asia/Manila' }).format(new Date(String(timestamp))) : '—';
const paymentStatus = (status: unknown) => status === 'approved' ? 'Verified' : status === 'pending' ? 'For Review' : status === 'rejected' ? 'Rejected' : value(status);
async function allRows(resource: string, tenantId?: string) {
  const rows: Row[] = [];
  for (let page=1;page<=25;page++) {
    const tenantFilter = tenantId ? `&tenantId=${encodeURIComponent(tenantId)}` : '';
    const response = await fetch(`/api/operations?resource=${resource}&page=${page}&pageSize=100${tenantFilter}`);
    if (!response.ok) throw new Error();
    const result = await response.json(); rows.push(...result.rows);
    if (rows.length >= result.count) break;
  }
  return rows;
}
async function allTenantRows() {
  const rows: Row[] = [];
  for (let page=1;page<=25;page++) {
    const response = await fetch(`/api/tenants/directory?page=${page}&pageSize=100&status=`);
    if (!response.ok) throw new Error();
    const result = await response.json(); rows.push(...result.rows);
    if (rows.length >= result.count) break;
  }
  return rows;
}

export function RoomManagementWorkspace({ initialView = 'map', initialTenantId }: { initialView?: View; initialTenantId?: string }) {
  const [view,setView] = useState<View>(initialView);
  const [rooms,setRooms] = useState<Row[]>([]);
  const [tenants,setTenants] = useState<Row[]>([]);
  const [assignments,setAssignments] = useState<Row[]>([]);
  const [filter,setFilter] = useState('all');
  const [filterOpen,setFilterOpen] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const [search,setSearch] = useState('');
  const [selected,setSelected] = useState<Row | null>(null);
  const [tenantHistory,setTenantHistory] = useState<{ payments: Row[]; concerns: Row[]; loading: boolean; error: string }>({ payments:[],concerns:[],loading:false,error:'' });
  const tenantSelection = useRef(0);
  const initialSelectionDone = useRef(false);
  const [form,setForm] = useState<'room' | 'assignment' | null>(null);
  const [moveSearch,setMoveSearch] = useState('');
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const load = useCallback(async () => {
    try { const [roomList,tenantList,assignmentList] = await Promise.all([allRows('rooms'),allTenantRows(),allRows('assignments')]);
      setRooms(roomList);setTenants(tenantList);setAssignments(assignmentList);setMessage(''); }
    catch { setMessage('Room records could not be loaded.'); }
    finally { setLoading(false); }
  },[]);
  useEffect(() => { const timer=window.setTimeout(() => void load(),0);return () => window.clearTimeout(timer); },[load]);
  useEffect(() => {
    function closeFilter(event: PointerEvent) {
      if (!filterMenuRef.current?.contains(event.target as Node)) setFilterOpen(false);
    }
    document.addEventListener('pointerdown',closeFilter);
    return () => document.removeEventListener('pointerdown',closeFilter);
  },[]);
  const activeAssignment = (tenantId: unknown) => assignments.find(row => row.tenant_id === tenantId && !row.ended_on);
  const roomOf = (tenantId: unknown) => rooms.find(room => room.id === activeAssignment(tenantId)?.room_id);
  const floorFilters = [...new Set(rooms.map(room => String(room.floor_label || '').trim()).filter(Boolean))];
  const filterOptions = [{ value:'all', label:'All Tenants', icon:'users' as const },
    ...floorFilters.map(floor => ({ value:floor, label:floor, icon:'map' as const })),
    ...(filter === 'rooms' ? [{ value:'rooms', label:'Rooms', icon:'map' as const }] : [])];
  const occupied = assignments.filter(row => !row.ended_on);
  const slots = rooms.reduce((sum,room) => sum + Number(room.capacity || 0),0);
  const available = rooms.filter(room => room.availability === 'available').reduce((sum,room) =>
    sum + Math.max(0,Number(room.capacity || 0)-occupied.filter(row => row.room_id === room.id).length),0);
  const slotOf = (tenantId: unknown) => {
    const assignment = activeAssignment(tenantId);
    if (!assignment) return null;
    const roomAssignments = occupied.filter(row => row.room_id === assignment.room_id).sort((a,b) =>
      String(a.started_on).localeCompare(String(b.started_on)) || String(a.created_at).localeCompare(String(b.created_at)));
    const position = roomAssignments.findIndex(row => row.tenant_id === tenantId);
    return position < 0 ? null : position + 1;
  };
  const summary = [
    ['Total Slots',slots,'Total tenant capacity'],['Occupied Slots',occupied.length,'Slots assigned to tenants'],
    ['Available Slots',available,'Slots open for assignment'],
    ['Tenants to Assign',tenants.filter(tenant => tenant.status === 'active' && !activeAssignment(tenant.user_id)).length,'Awaiting room assignment'],
  ];
  const people = tenants.filter(tenant => {
    if (filter !== 'all' && filter !== 'rooms' && roomOf(tenant.user_id)?.floor_label !== filter) return false;
    return String(tenant.display_name || '').toLowerCase().includes(search.toLowerCase());
  });
  const roomResults = rooms.filter(room => String(room.room_number || '').toLowerCase().includes(search.toLowerCase()));
  const selectedAssignment = selected?.user_id ? activeAssignment(selected.user_id) : undefined;
  const selectedRoom = selected?.user_id ? roomOf(selected.user_id) : undefined;
  const moveTargets = rooms.filter(room => room.availability === 'available' &&
    `${room.room_number} ${room.floor_label}`.toLowerCase().includes(moveSearch.toLowerCase()));
  async function selectTenant(row: Row) {
    setSelected(row); setForm(null); setTenantHistory({ payments:[],concerns:[],loading:true,error:'' });
    const selection = ++tenantSelection.current;
    try {
      const [payments,concerns] = await Promise.all([allRows('payments',String(row.user_id)),allRows('concerns',String(row.user_id))]);
      if (selection === tenantSelection.current) setTenantHistory({ payments,concerns,loading:false,error:'' });
    } catch {
      if (selection === tenantSelection.current) setTenantHistory({ payments:[],concerns:[],loading:false,error:'Tenant history could not be loaded.' });
    }
  }
  useEffect(() => {
    if (loading || !initialTenantId || initialSelectionDone.current) return;
    const match = tenants.find(row => row.user_id === initialTenantId);
    const timer = window.setTimeout(() => {
      initialSelectionDone.current = true;
      if (match) void selectTenant(match);
      else setMessage('That tenant is not available in the directory.');
    }, 0);
    return () => window.clearTimeout(timer);
  // Initial deep link is handled once after the authorized directory loads.
  }, [loading, tenants, initialTenantId]);
  async function operate(action: string, data: Record<string,unknown>) {
    const response = await fetch('/api/operations',{ method:'POST',headers:{ 'Content-Type':'application/json' },body:JSON.stringify({ action,data }) });
    if (!response.ok) throw new Error('The change could not be saved. Check the details and try again.');
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();if (!form || busy) return;
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    setBusy(true);
    try {
      if (form === 'room') await operate(selected?.id ? 'room.update' : 'room.create',{
        ...data,...(selected?.id ? { id:selected.id } : {}) });
      else await operate('room.assign',{ ...data,tenant_id:selected?.user_id });
      setForm(null);setMessage('Saved successfully.');await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The change could not be saved.'); }
    finally { setBusy(false); }
  }
  function handleViewKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='tab']")];
    const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | undefined;
    if (event.key === 'ArrowRight') next=(current+1)%tabs.length;
    if (event.key === 'ArrowLeft') next=(current-1+tabs.length)%tabs.length;
    if (event.key === 'Home') next=0;
    if (event.key === 'End') next=tabs.length-1;
    if (next === undefined) return;
    event.preventDefault();tabs[next].focus();setView(tabs[next].id === 'room-map-tab' ? 'map' : 'tenants');
  }
  return <div className={`room-management room-management--${view}`}><PageHeader title="Room Management" description="Manage room occupancy, tenant assignments, and room information."
    action={<button className="dashboard-export room-management__export" type="button" disabled><Icon name="download" />Export Report</button>} />
    <section className="room-summary" aria-label="Room occupancy summary">{summary.map(([title,count,detail],index) => <article
      className={`room-summary__card${index === 0 ? ' room-summary__card--highlight' : ''}`} key={String(title)}>
      <span className="room-summary__title">{title}</span><strong>{loading ? '—' : count}</strong><small>{detail}</small>
      <span className="room-summary__mark" aria-hidden="true"><Icon name="arrow" /></span>
    </article>)}</section>
    {message && <p role="status">{message} <button type="button" onClick={() => void load()}>Refresh</button></p>}
    <div className="room-tabs" role="tablist" aria-label="Room management views" onKeyDown={handleViewKeyDown}>
      <button className={view === 'map' ? 'is-active' : ''} type="button" role="tab" id="room-map-tab" aria-selected={view === 'map'} aria-controls="room-map-panel" onClick={() => setView('map')}><Icon name="map" />Building View</button>
      <button className={view === 'tenants' ? 'is-active' : ''} type="button" role="tab" id="room-tenants-tab" aria-selected={view === 'tenants'} aria-controls="room-tenants-panel" onClick={() => { if (filter==='rooms') { tenantSelection.current += 1;setFilter('all');setSelected(null);setSearch('');setForm(null); }setView('tenants'); }}><Icon name="users" />Tenant List</button>
    </div>
    <section className="room-workspace room-workspace--building" id="room-map-panel" role="tabpanel" aria-labelledby="room-map-tab" hidden={view !== 'map'}>
      {view === 'map' && <BuildingMapWorkspace role="owner"
        roomRecords={rooms as BuildingRoom[]} assignmentRecords={assignments as { room_id: string; ended_on: string | null }[]} recordsLoading={loading} onRecordsChanged={load}
        onOpenRoomRecord={room => { tenantSelection.current += 1;setFilter('rooms');setSelected({ ...room });setForm(null);setView('tenants'); }} />}
    </section>
    <section className="tenant-list-workspace" id="room-tenants-panel" role="tabpanel" aria-labelledby="room-tenants-tab" hidden={view !== 'tenants'}>
      <aside className="tenant-list-panel" aria-label="Tenant list filters"><div className="tenant-list-filter" ref={filterMenuRef} onKeyDown={event => { if (event.key === 'Escape') { setFilterOpen(false);filterMenuRef.current?.querySelector<HTMLButtonElement>('.tenant-list-filter__trigger')?.focus(); } }}>
        <button type="button" className="tenant-list-filter__trigger" aria-label="Tenant filter" aria-haspopup="listbox" aria-expanded={filterOpen} aria-controls="tenant-list-filter-options" onClick={() => setFilterOpen(open => !open)}>
          <Icon name={filter === 'all' || filter === 'rooms' ? 'users' : 'map'} /><span>{filterOptions.find(option => option.value === filter)?.label ?? 'All Tenants'}</span><Icon className="tenant-list-filter__chevron" name="chevron" />
        </button>
        {filterOpen && <div className="tenant-list-filter__menu" id="tenant-list-filter-options" role="listbox" aria-label="Filter tenants by floor">
          {filterOptions.map(option => <button type="button" role="option" aria-selected={filter === option.value} className={filter === option.value ? 'is-selected' : ''} key={option.value} onClick={() => { tenantSelection.current += 1;setFilter(option.value);setSelected(null);setSearch('');setForm(null);setFilterOpen(false); }}>
            <Icon name={option.icon} /><span>{option.label}</span>{filter === option.value && <span className="tenant-list-filter__check" aria-hidden="true">✓</span>}
          </button>)}
        </div>}
      </div>
        <label className="tenant-list-search"><Icon name="search" /><input aria-label={filter==='rooms'?'Search rooms':'Search tenants'} placeholder={filter==='rooms'?'Search room...':'Search tenant...'} value={search} onChange={event => setSearch(event.target.value)} /></label>
        {loading && !rooms.length && !tenants.length ? <DataSkeleton /> : (filter==='rooms' ? roomResults : people).length ? <div className="room-list-records">{(filter==='rooms' ? roomResults : people).map(row => <button type="button" key={String(row.id || row.user_id)} className="room-list-record" onClick={() => { if (filter==='rooms') { tenantSelection.current += 1;setSelected(row);setForm(null); } else void selectTenant(row); }}>
          <span className="room-list-avatar">{String((filter==='rooms' ? row.room_number : row.display_name) || '?').slice(0,1).toUpperCase()}</span><span><strong>{value(filter==='rooms' ? row.room_number : row.display_name)}</strong><small>{filter==='rooms' ? `${row.floor_label} · ${row.capacity} slots` : slotOf(row.user_id) ? `Slot ${slotOf(row.user_id)}${row.tenant_code ? ` · ${row.tenant_code}` : ''}` : 'Awaiting room assignment'}</small></span>
        </button>)}</div> : <p className="tenant-list-empty">No records to display.</p>}
      </aside>
      <section className="tenant-details-panel" aria-labelledby="tenant-details-title"><h2 id="tenant-details-title">{filter==='rooms'?'Room Details':'Tenant Details'}</h2>
        {selected ? <div className="room-selected-details">
          {filter==='rooms' ? <><h3>Room {value(selected.room_number)}</h3><p>Floor: {value(selected.floor_label)}</p><p>Capacity: {value(selected.capacity)}</p><p>Availability: {value(selected.availability)}</p><p>Occupants: {occupied.filter(row => row.room_id === selected.id).length}</p>
            <button className="button button--secondary" type="button" onClick={() => setForm('room')}>Edit room</button></>
            : <div className="room-tenant-detail">
              <div className="room-tenant-detail__identity"><span className="room-list-avatar" aria-hidden="true">{String(selected.display_name || '?').trim().split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</span><div><strong>{value(selected.display_name)}</strong><small>{value(selected.email)}</small></div><button type="button" aria-label="Close tenant details" onClick={() => { tenantSelection.current += 1;setSelected(null); }}>×</button></div>
              {tenantHistory.error && <p role="alert" className="room-tenant-detail__error">{tenantHistory.error}</p>}
              <div className="room-tenant-detail__grid">
                <section className="room-tenant-detail__tile"><h3>Personal Information</h3><dl>
                  <div><dt>Full Name</dt><dd>{value(selected.display_name)}</dd></div><div><dt>Contact Number</dt><dd>{value(selected.phone)}</dd></div><div><dt>Email Address</dt><dd>{value(selected.email)}</dd></div><div><dt>Home Address</dt><dd>{value(selected.home_address)}</dd></div><div><dt>Tenant ID</dt><dd>{value(selected.tenant_code)}</dd></div>
                </dl><hr /><h4>Emergency Contact</h4><dl><div><dt>Contact Details</dt><dd>{value(selected.emergency_contact)}</dd></div></dl></section>
                <section className="room-tenant-detail__tile"><h3>Contract Details</h3><dl>
                  <div><dt>Room Assignment</dt><dd>{selectedRoom ? `Room ${value(selectedRoom.room_number)}` : 'Unassigned'}</dd></div><div><dt>Contract Start Date</dt><dd>{value(selectedAssignment?.started_on)}</dd></div><div><dt>Contract End Date</dt><dd>Not recorded</dd></div><div><dt>Monthly Rent</dt><dd>₱3,000</dd></div><div><dt>Contract Status</dt><dd>{value(selected.status)}</dd></div>
                </dl><div className="room-tenant-detail__document"><Icon name="fileSearch" /><span>Rental contract not linked</span></div></section>
                <section className="room-tenant-detail__tile"><h3>Payment History</h3>{tenantHistory.loading ? <DataSkeleton label="Loading payment history" variant="table" count={2} /> : tenantHistory.error ? <p className="room-tenant-detail__empty">Payment history is unavailable.</p> : tenantHistory.payments.length ? <div className="room-tenant-detail__table-wrap"><table><thead><tr><th>Month</th><th>Amount</th><th>Status</th></tr></thead><tbody>{tenantHistory.payments.slice(0,3).map(payment => <tr key={String(payment.id)}><td>{formatMonth(payment.created_at)}</td><td>{formatPhp(payment.amount)}</td><td><span className={`room-tenant-detail__payment-status room-tenant-detail__payment-status--${String(payment.status)}`}>{paymentStatus(payment.status)}</span></td></tr>)}</tbody></table></div> : <p className="room-tenant-detail__empty">No payment records to display.</p>}<a className="room-tenant-detail__view-all" href={`/management/payments?search=${encodeURIComponent(String(selected.display_name ?? ''))}`}>View All Records</a></section>
                <section className="room-tenant-detail__tile"><h3>Concerns &amp; Suggestions</h3>{tenantHistory.loading ? <DataSkeleton label="Loading concerns" variant="details" count={2} /> : tenantHistory.error ? <p className="room-tenant-detail__empty">Concern history is unavailable.</p> : <div className="room-tenant-detail__stats"><div><strong>{tenantHistory.concerns.length}</strong><span>Total submissions</span></div><div><strong>{tenantHistory.concerns.filter(concern => concern.status !== 'resolved').length}</strong><span>Unresolved</span></div></div>}<a className="room-tenant-detail__view-all" href={`/management/concerns?tenant=${encodeURIComponent(String(selected.user_id))}`}>View All Records</a></section>
              </div>
              <div className="room-tenant-detail__actions"><button className={`button ${selectedAssignment ? 'button--primary' : 'button--secondary'}`} type="button" onClick={() => setForm('assignment')}>{selectedAssignment?'Move tenant':'Assign room'}</button></div>
            </div>}
        </div> : <div className="room-details-empty"><span className="room-details-empty__icon"><Icon name="fileSearch" /></span><strong>{filter==='rooms'?'No Room Selected':'No Tenant Selected'}</strong><p>Select a record from the list to view its details.</p></div>}
      </section>
    </section>
    <ResponsiveOverlay
      open={form === 'room' && Boolean(selected)}
      onClose={() => setForm(null)}
      title="Edit room"
      description="Update the room record. Changes are visible to staff immediately."
      variant="dialog"
    >
      {selected && <form key={String(selected.id)} className="operational-form room-detail-form" onSubmit={save}>
        <label>Room number<input name="room_number" defaultValue={value(selected.room_number).replace('—','')} maxLength={32} required /></label>
        <label>Floor<input name="floor_label" defaultValue={value(selected.floor_label).replace('—','')} maxLength={40} required /></label>
        <label>Capacity<input name="capacity" type="number" min={1} max={100} defaultValue={Number(selected.capacity || 1)} required /></label>
        <label>Availability<select name="availability" defaultValue={String(selected.availability)}><option value="available">Available</option><option value="reserved">Reserved</option><option value="maintenance">Maintenance</option></select></label>
        <div className="ps-overlay__actions"><button className="button button--primary" disabled={busy}>{busy?'Saving…':'Save changes'}</button><button type="button" className="button button--secondary" onClick={() => setForm(null)}>Cancel</button></div>
      </form>}
    </ResponsiveOverlay>
    <ResponsiveOverlay
      open={form === 'assignment' && Boolean(selected)}
      onClose={() => setForm(null)}
      title={selectedAssignment ? 'Move tenant' : 'Assign room'}
      description={selected ? `${value(selected.display_name)} · ${selectedRoom ? `Room ${value(selectedRoom.room_number)}` : 'No room assigned'}` : undefined}
      variant="drawer"
    >
      {selected && <form key={String(selected.user_id)} className="tenant-move-flow tenant-move-flow--overlay" onSubmit={save}>
        <p className="tenant-move-flow__intro">{selectedAssignment ? `Choose a new room for ${value(selected.display_name)}.` : `Choose a room for ${value(selected.display_name)}.`}</p>
        <div className="tenant-move-flow__layout">
          <section className="tenant-move-flow__current"><h3>Tenant</h3><div className="tenant-move-flow__resident"><span className="room-list-avatar" aria-hidden="true">{String(selected.display_name || '?').trim().split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</span><div><strong>{value(selected.display_name)}</strong><small>{value(selected.email)}</small></div></div><dl><div><dt>Current Room</dt><dd>{selectedRoom ? `Room ${value(selectedRoom.room_number)}` : 'No room assigned'}</dd></div><div><dt>Floor</dt><dd>{value(selectedRoom?.floor_label)}</dd></div>{selectedAssignment && <div><dt>Current Slot</dt><dd>{slotOf(selected.user_id) ? `Slot ${slotOf(selected.user_id)}` : '—'}</dd></div>}</dl></section>
          <section className="tenant-move-flow__destination"><label className="tenant-move-flow__search">Search rooms<input type="search" value={moveSearch} onChange={event => setMoveSearch(event.target.value)} placeholder="Search room or floor" /></label><div className="tenant-move-flow__list-head"><h3>Available Rooms</h3><span>{moveTargets.length} {moveTargets.length === 1 ? 'room' : 'rooms'}</span></div><div className="tenant-move-flow__rooms">{moveTargets.length ? moveTargets.map(room => <label className="tenant-move-flow__room" key={String(room.id)}><input type="radio" name="room_id" value={String(room.id)} required /><span><strong>Room {value(room.room_number)}</strong><small>{value(room.floor_label)} · {value(room.capacity)} slots</small></span><span className="tenant-move-flow__available">Available</span></label>) : <p className="tenant-move-flow__empty">{moveSearch ? 'No available rooms match your search.' : 'No available rooms to assign.'}</p>}</div></section>
        </div>
        <div className="tenant-move-flow__footer"><label>Start date<input name="started_on" type="date" required /></label><div><button className="button button--secondary" type="button" onClick={() => setForm(null)}>Cancel</button><button className="button button--primary" disabled={busy || moveTargets.length === 0}>{busy ? 'Saving…' : selectedAssignment ? 'Confirm Move' : 'Confirm Assignment'}</button></div></div>
      </form>}
    </ResponsiveOverlay>
  </div>;
}
