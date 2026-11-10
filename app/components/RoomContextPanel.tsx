'use client';

import { DataSkeleton } from './DataSkeleton';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Icon } from './Icon';
import type { RoomContext, RoomMaintenance, RoomResident } from '../lib/room-context.mjs';
import { assignableTenants, manilaToday, partitionRoomActivity } from '../lib/room-context.mjs';

type Role = 'owner' | 'caretaker';

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || '?';
}
function text(value: string | null | undefined) { return value?.trim() || 'Not provided'; }
function date(value: string) { return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' }).format(new Date(`${value}T12:00:00+08:00`)); }
function time(value: string | null) { return value ? value.slice(0, 5) : 'Time not set'; }
function status(value: string) { return value.replaceAll('_', ' '); }

export function RoomContextPanel({ roomId, role, onChanged, presentation = 'activity', onViewRequests }: { roomId: string; role: Role; onChanged: () => Promise<void>; presentation?: 'activity' | 'management' | 'maintenance'; onViewRequests?: () => void }) {
  const [context, setContext] = useState<RoomContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedResident, setSelectedResident] = useState<RoomResident | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [form, setForm] = useState<'edit' | 'assign' | null>(null);
  const [candidates, setCandidates] = useState<RoomResident[]>([]);
  const [tenantSearch, setTenantSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [assignment, setAssignment] = useState<Record<string, FormDataEntryValue> | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/rooms/context?roomId=${encodeURIComponent(roomId)}`, { cache: 'no-store', signal });
      if (!response.ok) throw new Error(response.status === 403 ? 'You do not have access to this room.' : 'Room details could not be loaded.');
      const data = await response.json() as RoomContext;
      if (!['owner', 'caretaker'].includes(data.viewer_role) || data.room?.id?.toLowerCase() !== roomId.toLowerCase()) throw new Error('Room details could not be verified.');
      setContext(data);
    } catch (caught) {
      if (signal?.aborted) return;
      setError(caught instanceof Error ? caught.message : 'Room details could not be loaded.');
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [roomId, role]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [load]);

  async function operate(action: string, data: Record<string, unknown>) {
    const response = await fetch('/api/operations', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, data }) });
    if (!response.ok) throw new Error(response.status === 403 ? 'You cannot make this change.' : 'The change could not be saved.');
    await Promise.all([load(), onChanged()]);
  }
  async function openAssign() {
    if (!context || context.room.availability !== 'available' || context.residents.length >= context.room.capacity) {
      setError('This room is not available for another assignment.');
      return;
    }
    setError('');
    try {
      const [profilesResponse, assignmentsResponse] = await Promise.all([
        fetch('/api/operations?resource=tenants&pageSize=100', { cache: 'no-store' }),
        fetch('/api/operations?resource=assignments&pageSize=100', { cache: 'no-store' }),
      ]);
      if (!profilesResponse.ok || !assignmentsResponse.ok) throw new Error('Eligible tenants could not be loaded.');
      const profiles = await profilesResponse.json() as { rows: RoomResident[]; count: number };
      const assignmentRows = await assignmentsResponse.json() as { rows: { tenant_id: string; room_id: string; started_on: string; ended_on: string | null }[]; count: number };
      if (profiles.count > 100 || assignmentRows.count > 100) throw new Error('Use the Tenant List to assign from the complete records.');
      setCandidates(assignableTenants(profiles.rows, assignmentRows.rows));
      setTenantSearch(''); setAssignment(null); setForm('assign');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Eligible tenants could not be loaded.'); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !context) return;
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (form === 'assign' && !assignment) { setAssignment(values); return; }
    const confirmed = assignment ? { ...assignment, ...values } : values;
    setBusy(true); setMessage('');
    try {
      if (form === 'edit') await operate('room.update', { id: roomId, ...values });
      if (form === 'assign') await operate('room.assign', { room_id: roomId, tenant_id: confirmed.tenant_id, started_on: confirmed.started_on });
      setForm(null); setAssignment(null); setMessage('Saved successfully.');
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'The change could not be saved.'); }
    finally { setBusy(false); }
  }
  async function updateIssue(event: FormEvent<HTMLFormElement>, issue: RoomMaintenance) {
    event.preventDefault(); if (busy) return;
    const response = String(new FormData(event.currentTarget).get('response') ?? '').trim();
    const next = issue.status === 'pending' ? 'in_progress' : 'resolved';
    setBusy(true); setMessage('');
    try { await operate('maintenance.update', { id: issue.id, status: next, response }); setMessage('Maintenance updated.'); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : 'The update could not be saved.'); }
    finally { setBusy(false); }
  }

  if (loading && !context) return <DataSkeleton label="Loading room details" variant="details" />;
  if (error && !context) return <p role="alert">{error} <button type="button" onClick={() => void load()}>Retry</button></p>;
  if (!context) return null;
  const viewerRole = context.viewer_role;
  const isManagement = presentation === 'management' || viewerRole === 'owner';
  const activity = partitionRoomActivity(context, manilaToday());
  const filteredCandidates = candidates.filter(person => person.display_name.toLocaleLowerCase().includes(tenantSearch.trim().toLocaleLowerCase()));
  const selectedTenant = candidates.find(person => person.user_id === assignment?.tenant_id);
  if (presentation === 'maintenance') {
    const unresolved = context.maintenance.filter(issue => issue.status !== 'resolved').length;
    return <div className="maintenance-room-details">
      {error && <p role="alert">{error}</p>}
      <div className="maintenance-room-title"><h3>Room {context.room.room_number}</h3><span>{unresolved ? `${unresolved} unresolved` : 'No open issues'}</span></div>
      <p className="maintenance-room-floor">{context.room.floor_label}</p>
      <dl className="maintenance-room-metrics"><div><dt>Total Requests</dt><dd>{context.maintenance.length}</dd></div><div><dt>Unresolved</dt><dd>{unresolved}</dd></div></dl>
      <h4>Maintenance Requests ({context.maintenance.length})</h4>
      <div className="maintenance-room-requests">{context.maintenance.length ? context.maintenance.map(issue => <article key={issue.id}><div><strong>{status(issue.category)}</strong><span className={`maintenance-room-status maintenance-room-status--${issue.status}`}>{issue.status === 'in_progress' ? 'In Progress' : issue.status === 'resolved' ? 'Resolved' : 'Pending'}</span></div><time dateTime={issue.created_at}>{new Date(issue.created_at).toLocaleDateString(undefined,{ month:'short',day:'numeric',year:'numeric' })}</time><details><summary>Request details</summary><p>{issue.description}</p>{issue.staff_response && <p>{issue.staff_response}</p>}<form onSubmit={event => void updateIssue(event,issue)}>{issue.status !== 'resolved' && <><label>Update for tenant<textarea name="response" required minLength={2} maxLength={2000} rows={2} /></label><button className="button button--secondary" disabled={busy}>{issue.status === 'pending' ? 'Start work' : 'Mark resolved'}</button></>}</form></details></article>) : <p>No maintenance requests for this room.</p>}</div>
      <button type="button" className="button button--secondary maintenance-room-view-all" onClick={onViewRequests}>View All Requests</button>
      {message && <p role="status">{message}</p>}
    </div>;
  }
  if (presentation === 'management' && form === 'assign') {
    return <div className="room-assignment-flow">
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {assignment ? <>
        <button className="room-assignment-flow__back" type="button" onClick={() => setAssignment(null)}>← Confirm Assignment</button>
        <div className="room-assignment-flow__tenant"><span className="room-context__avatar" aria-hidden="true">{initials(selectedTenant?.display_name ?? '')}</span><div><strong>{selectedTenant?.display_name}</strong><small>Active tenant · no room assigned</small></div></div>
        <dl className="room-assignment-flow__facts"><div><dt>Room Number</dt><dd>Room {context.room.room_number}</dd></div><div><dt>Slot</dt><dd>Slot {context.residents.length + 1}</dd></div><div><dt>Room Type</dt><dd>—</dd></div><div><dt>Monthly Rent</dt><dd>₱3,000</dd></div></dl>
        <form className="room-assignment-flow__confirm" onSubmit={event => void submit(event)}>
          <label>Start date<input name="started_on" type="date" defaultValue={String(assignment.started_on)} min={manilaToday()} required /></label>
          <div className="room-assignment-flow__actions"><button type="button" className="button button--secondary" onClick={() => setAssignment(null)}>Back</button><button type="submit" className="button button--primary" disabled={busy}>{busy ? 'Saving…' : 'Confirm Assignment'}</button></div>
        </form>
      </> : <>
        <button className="room-assignment-flow__back" type="button" onClick={() => setForm(null)}>← Assign Tenant</button>
        <p className="room-assignment-flow__intro">Select a tenant to assign to this room slot.</p>
        <section className="room-assignment-flow__room"><h4>Room {context.room.room_number}</h4><p>{context.room.floor_label}</p><div><span>Selected Slot</span><strong>Slot {context.residents.length + 1}</strong><span className="room-assignment-flow__available">Available</span></div></section>
        <label className="room-assignment-flow__search">Search Tenant<input type="search" value={tenantSearch} onChange={event => setTenantSearch(event.target.value)} placeholder="Search name" /></label>
        <div className="room-assignment-flow__list-head"><h4>Eligible Tenants</h4><span>{filteredCandidates.length} {filteredCandidates.length === 1 ? 'tenant' : 'tenants'}</span></div>
        <div className="room-assignment-flow__list">{filteredCandidates.length ? filteredCandidates.map(person => {
          return <article className="room-assignment-flow__candidate" key={person.user_id}><span className="room-context__avatar" aria-hidden="true">{initials(person.display_name)}</span><div><strong>{person.display_name}</strong><small>Active tenant · no room assigned</small></div><button type="button" className="button button--secondary" onClick={() => setAssignment({ tenant_id: person.user_id, started_on: manilaToday() })}>Select</button></article>;
        }) : <p className="room-context__empty">{tenantSearch ? 'No tenants match your search.' : 'No active tenants are available for this room.'}</p>}</div>
      </>}
      <button type="button" className="room-assignment-flow__cancel" onClick={() => { setAssignment(null); setForm(null); }}>Cancel</button>
    </div>;
  }
  const vacantAvailableRoom = isManagement && context.room.availability === 'available' && context.residents.length === 0;
  return <div className={`room-context${isManagement ? ' room-context--management' : ''}${vacantAvailableRoom ? ' room-context--vacant' : ''}${form ? ' room-context--editing' : ''}`}>
    {error && <p role="alert">{error} <button type="button" onClick={() => void load()}>Retry</button></p>}
    {message && <p role="status">{message}</p>}
    {selectedResident && viewerRole === 'owner' ? <section className="room-context__profile" aria-label="Tenant profile">
      <button className="room-context__back" type="button" onClick={() => setSelectedResident(null)}>← Room details</button>
      <div className="room-context__person"><span className="room-context__avatar" aria-hidden="true">{initials(selectedResident.display_name)}</span><div><h4>{selectedResident.display_name}</h4><small>{status(selectedResident.status)}</small></div></div>
      <dl className="room-context__details"><div><dt>Email</dt><dd>{text(selectedResident.email)}</dd></div><div><dt>Phone</dt><dd>{text(selectedResident.phone)}</dd></div>
        <div><dt>Emergency contact</dt><dd>{text(selectedResident.emergency_contact)}</dd></div><div><dt>Room</dt><dd>{context.room.room_number}</dd></div><div><dt>Status</dt><dd>{status(selectedResident.status)}</dd></div></dl>
      <p className="room-context__hint">Profile photos can be added by tenants later.</p>
    </section> : <>
      {isManagement && <div className="room-record-summary"><div><h3>Room {context.room.room_number}</h3><span className={`room-occupancy room-occupancy--${context.residents.length >= context.room.capacity ? 'full' : context.residents.length ? 'partial' : 'available'}`}>{context.room.availability !== 'available' ? status(context.room.availability) : context.residents.length >= context.room.capacity ? 'Fully Occupied' : context.residents.length ? 'Partially Occupied' : 'Available'}</span></div><p>{context.room.floor_label}</p><dl><div><dt>Capacity</dt><dd>{context.room.capacity} slots</dd></div><div><dt>Occupancy</dt><dd>{context.residents.length} / {context.room.capacity}</dd></div><div><dt>Monthly Rent</dt><dd>₱3,000</dd></div><div><dt>Available Slots</dt><dd>{Math.max(0,context.room.capacity-context.residents.length)}</dd></div></dl></div>}
      <div className="room-context__section room-context__residents"><div className="room-context__section-head"><h4>{isManagement ? `Assigned Tenants (${context.residents.length})` : 'Assigned Tenants'}{!isManagement && <small>{context.residents.length}/{context.room.capacity}</small>}</h4></div>
        {context.residents.length ? <div className="room-context__people">{context.residents.map(resident => viewerRole === 'owner'
          ? <button className="room-context__person" key={resident.user_id} type="button" onClick={() => setSelectedResident(resident)}><span className="room-context__avatar" aria-hidden="true">{initials(resident.display_name)}</span><span><strong>{resident.display_name}</strong><small>View tenant details</small></span><span aria-hidden="true">›</span></button>
          : <div className="room-context__person" key={resident.user_id}><span className="room-context__avatar" aria-hidden="true">{initials(resident.display_name)}</span><span><strong>{resident.display_name}</strong><small>{text(resident.phone)}</small></span></div>)}</div>
          : isManagement && context.room.availability === 'available' ? <div className="room-vacant-state"><span className="room-vacant-state__icon"><Icon name="users" width={30} height={30} /></span><strong>No Tenants Assigned</strong><p>This room is available for tenant assignment.</p>{viewerRole === 'owner' && <button className="button button--secondary" type="button" onClick={() => void openAssign()}>Assign Tenant</button>}</div>
          : <p className="room-context__empty">No tenants are assigned to this room.</p>}
        {isManagement && viewerRole === 'owner' && context.residents.length > 0 && context.room.availability === 'available' && context.residents.length < context.room.capacity && <div className="room-available-slot"><div><strong>{context.room.capacity-context.residents.length} available {context.room.capacity-context.residents.length === 1 ? 'slot' : 'slots'}</strong><small>This room is open for tenant assignment.</small></div><button className="button button--secondary" type="button" onClick={() => void openAssign()}>Assign Tenant</button></div>}</div>
      <div className="room-context__section"><h4>Today & upcoming visits <small>{activity.upcomingVisits.length}</small></h4>
        {activity.upcomingVisits.length ? activity.upcomingVisits.map(visit => <article className="room-context__item" key={visit.id}><strong>{visit.visitor_name}</strong><span>{date(visit.visit_on)} · {time(visit.arrival_time)}{visit.departure_time ? `–${time(visit.departure_time)}` : ''}</span><small>Visiting {visit.resident_name}</small>{viewerRole === 'owner' && visit.purpose && <p>{visit.purpose}</p>}</article>)
          : <p className="room-context__empty">No planned visits for today or later.</p>}</div>
      <div className="room-context__section"><h4>Open maintenance <small>{activity.openMaintenance.length}</small></h4>
        {activity.openMaintenance.length ? activity.openMaintenance.map(issue => <article className="room-context__item" key={issue.id}><div className="room-context__item-head"><strong>{status(issue.category)}</strong><span className={`building-experience__status building-experience__status--${issue.status}`}>{status(issue.status)}</span></div><p>{issue.description}</p>
          {issue.staff_response && <small>Latest update: {issue.staff_response}</small>}{issue.attachment_id && <a href={`/api/attachments?id=${encodeURIComponent(issue.attachment_id)}`}>View attachment</a>}
          <form onSubmit={event => void updateIssue(event, issue)}><label>Update for tenant<textarea name="response" rows={2} minLength={2} maxLength={2000} required /></label><button className="button button--primary" type="submit" disabled={busy}>{busy ? 'Saving…' : issue.status === 'pending' ? 'Start work' : 'Mark resolved'}</button></form></article>)
          : <p className="room-context__empty">No open maintenance requests for this room.</p>}</div>
      {viewerRole === 'owner' && <div className="room-context__section"><h4 className="room-context__action-title">Room actions</h4><div className="room-context__actions"><button type="button" className="button button--secondary" onClick={() => { setAssignment(null); setForm(form === 'edit' ? null : 'edit'); }}>Edit room</button>{presentation === 'management' ? <a className="button button--primary" href="/management/rooms?view=tenants">View Tenants</a> : <button type="button" className="button button--secondary" disabled={context.room.availability !== 'available' || context.residents.length >= context.room.capacity} onClick={() => void openAssign()}>Assign tenant</button>}</div>
        {form && <form className="operational-form room-context__form" onSubmit={event => void submit(event)}>{assignment ? <><h4>Confirm Assignment</h4><div className="room-context__person"><span className="room-context__avatar">{initials(candidates.find(person => person.user_id === assignment.tenant_id)?.display_name || '')}</span><strong>{candidates.find(person => person.user_id === assignment.tenant_id)?.display_name}</strong></div><p>Room {context.room.room_number}</p><p>Start date: {String(assignment.started_on)}</p></> : form === 'edit' ? <><h4>Edit Room</h4><label>Room number<input name="room_number" defaultValue={context.room.room_number} maxLength={32} required /></label><label>Floor<input name="floor_label" defaultValue={context.room.floor_label} maxLength={40} required /></label><label>Capacity<input name="capacity" type="number" min={1} max={100} defaultValue={context.room.capacity} required /></label><label>Availability<select name="availability" defaultValue={context.room.availability}><option value="available">Available</option><option value="reserved">Reserved</option><option value="maintenance">Maintenance</option></select></label></>
          : <><label>Tenant<select name="tenant_id" defaultValue="" required><option value="" disabled>Select tenant</option>{candidates.map(person => <option key={person.user_id} value={person.user_id}>{person.display_name}</option>)}</select></label><label>Start date<input name="started_on" type="date" required /></label>{!candidates.length && <p>No unassigned active tenants are available.</p>}</>}
          <button className="button button--primary" type="submit" disabled={busy || (form === 'assign' && !candidates.length)}>{busy ? 'Saving…' : assignment ? 'Confirm Assignment' : form === 'assign' ? 'Continue' : 'Save Changes'}</button><button type="button" onClick={() => { if (assignment) setAssignment(null); else setForm(null); }}>Cancel</button></form>}</div>}
      <div className="room-context__section"><button className="room-context__history-toggle" type="button" aria-expanded={showHistory} onClick={() => setShowHistory(value => !value)}>History <span>{showHistory ? '−' : '+'}</span></button>
        {showHistory && <div className="room-context__history"><h5>Recent past & cancelled visits</h5>{viewerRole === 'owner' ? activity.visitHistory.length ? activity.visitHistory.map(visit => <article className="room-context__item" key={visit.id}><strong>{visit.visitor_name}</strong><span>{date(visit.visit_on)} · {time(visit.arrival_time)}{visit.cancelled_at ? ' · Cancelled' : ''}</span></article>) : <p className="room-context__empty">No past or cancelled visits.</p> : <p className="room-context__empty">Past visits are available to the owner.</p>}
          <h5>Resolved maintenance</h5>{activity.maintenanceHistory.length ? activity.maintenanceHistory.map(issue => <article className="room-context__item" key={issue.id}><strong>{status(issue.category)}</strong><p>{issue.description}</p><small>{issue.staff_response || 'Resolved'}</small></article>) : <p className="room-context__empty">No resolved requests.</p>}</div>}</div>
    </>}
  </div>;
}
