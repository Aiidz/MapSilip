'use client';

import { CalendarDateInput } from './CalendarDateInput';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ResponsiveOverlay } from './ResponsiveOverlay';
import { DataSkeleton } from './DataSkeleton';
import { Icon } from './Icon';
import { contractEndDate } from '../lib/contract-dates.mjs';
import { manilaToday } from '../lib/room-context.mjs';
import { reviewRoomOptions, type ReviewRoom } from '../lib/access-review.mjs';
import { prepareUpload, uploadPreparedAttachment } from '../lib/uploads/client';

type AccessRequest = { id: string; display_name: string; email: string; phone: string | null; gender?: string; preferred_room_id?: string | null; created_at: string };
type Assignment = { room_id: string; ended_on: string | null };
const php = (amount: number | null) => amount == null ? 'Rent not set' : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(amount);
async function getAll(resource: string, status = '') {
  const rows: Record<string, unknown>[] = [];
  for (let page = 1; page <= 100; page++) {
    const query = new URLSearchParams({ resource, page: String(page), pageSize: '100' });
    if (status) query.set('status', status);
    const response = await fetch(`/api/operations?${query}`, { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Records could not be loaded.');
    rows.push(...result.rows);
    if (rows.length >= result.count || !result.rows.length) return rows;
  }
  throw new Error('The complete records could not be loaded. Refine this workspace before reviewing requests.');
}

export function AccountRequestsDialog({ open }: { open: boolean }) {
  const router = useRouter();
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [rooms, setRooms] = useState<ReviewRoom[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selected, setSelected] = useState<AccessRequest | null>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const [roomId, setRoomId] = useState('');
  const [search, setSearch] = useState('');
  const [roomSearch, setRoomSearch] = useState('');
  const [floor, setFloor] = useState('all');
  const [startedOn, setStartedOn] = useState(manilaToday);
  const [endOverride, setEndOverride] = useState<string | null>(null);
  const endOn = endOverride ?? contractEndDate(startedOn);
  const [note, setNote] = useState('');
  const [contract, setContract] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const uploadedContract = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const locked = busy || preparing;
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const queueHeading = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const [requestRows, roomRows, assignmentRows] = await Promise.all([getAll('accountRequests', 'pending'), getAll('rooms'), getAll('assignments')]);
      setRequests(requestRows as AccessRequest[]); setRooms(roomRows as ReviewRoom[]); setAssignments(assignmentRows as Assignment[]);
    } catch (caught) { setLoadError(caught instanceof Error ? caught.message : 'Requests could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (!open) return; const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [open, load]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  // Unlinked uploads remain visible for owner review; leaving a dialog never deletes evidence.
  async function discardUpload() { uploadedContract.current = null; }
  async function close() {
    if (locked) return;
    setBusy(true);
    try { await discardUpload(); router.replace('/management'); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not close this review.'); }
    finally { setBusy(false); }
  }
  async function selectRequest(request: AccessRequest | null) {
    if (locked) return;
    setBusy(true);
    try {
      await discardUpload();
      const preferred = request && reviewRoomOptions(rooms, assignments, request.gender)
        .find(room => room.id === request.preferred_room_id && room.eligible);
      setSelected(request); setRoomId(preferred ? preferred.id : ''); setRoomSearch(''); setFloor('all'); setDecision('approved'); setStartedOn(manilaToday()); setEndOverride(null); setNote(''); setContract(null); setPreview(''); setError('');
      window.requestAnimationFrame(() => (request ? detailHeading : queueHeading).current?.focus());
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not switch requests.'); }
    finally { setBusy(false); }
  }
  async function chooseContract(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || locked) return;
    setPreparing(true); setError('');
    try { const prepared = await prepareUpload(file, 'contract'); await discardUpload(); setContract(prepared); setPreview(URL.createObjectURL(prepared)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The contract image could not be prepared.'); }
    finally { setPreparing(false); }
  }
  const options = reviewRoomOptions(rooms, assignments, selected?.gender);
  const chosen = options.find(room => room.id === roomId && room.eligible);
  const visibleRooms = options.filter(room => (floor === 'all' || floor === room.floor_label) && `${room.room_number} ${room.floor_label}`.toLowerCase().includes(roomSearch.trim().toLowerCase()));
  const filteredRequests = requests.filter(request => `${request.display_name} ${request.email}`.toLowerCase().includes(search.trim().toLowerCase()));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || locked || loadError) return;
    if (decision === 'approved' && !chosen) { setError('Select an eligible room before approving.'); return; }
    if (decision === 'approved') {
      if (!contractEndDate(startedOn, endOn ?? '')) { setError('Choose valid contract dates. The end date must be on or after the start date.'); return; }
      if (!contract && !uploadedContract.current &&
          !window.confirm('No rental contract is attached. Approve this tenant request anyway?')) return;
    }
    if (decision === 'rejected' && !note.trim()) { setError('Add a reason for the applicant.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      if (decision === 'approved' && contract && !uploadedContract.current) uploadedContract.current = await uploadPreparedAttachment(contract, 'contract');
      if (decision === 'rejected') await discardUpload();
      const response = await fetch('/api/account-requests/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        id: selected.id, decision, room_id: decision === 'approved' ? roomId : null,
        started_on: decision === 'approved' ? startedOn : null,
        contract_end_on: decision === 'approved' ? endOn : null, note: note.trim() || null,
        contract_attachment_id: decision === 'approved' ? uploadedContract.current : null,
      }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Review could not be saved. The room may have changed; refresh the room list and try again.');
      uploadedContract.current = null; setContract(null); setPreview(''); setSelected(null); setRoomId('');
      setMessage(result.message || 'Review saved.'); await load(); router.refresh();
      window.requestAnimationFrame(() => queueHeading.current?.focus());
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Review could not be saved.'); }
    finally { setBusy(false); }
  }

  return <ResponsiveOverlay open={open} onClose={() => void close()} dismissible={!locked} title="Access requests" description="Review an applicant, choose their room, and link their rental contract." className="access-review">
    {message && <p className="access-review__notice" role="status">{message}</p>}
    {loadError && <p className="access-review__error" role="alert">{loadError} <button type="button" disabled={locked} onClick={() => void load()}>Retry loading</button></p>}
    {error && <p className="access-review__error" role="alert">{error}</p>}
    <div className={`access-review__layout${selected ? ' has-selection' : ''}`} aria-busy={loading || locked}>
      <aside className="access-review__queue" aria-label="Pending applications">
        <div className="access-review__section-heading"><h3 ref={queueHeading} tabIndex={-1}>Awaiting review</h3><span>{loading ? '…' : requests.length}</span></div>
        <label className="access-review__search"><Icon name="search" /><span className="sr-only">Search applicants</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find an applicant" disabled={locked} /></label>
        {loading && !requests.length ? <DataSkeleton label="Loading access requests" /> : <div className="access-review__applicants">{filteredRequests.map(request => <button key={request.id} type="button" disabled={locked} aria-pressed={selected?.id === request.id} onClick={() => void selectRequest(request)}><span className="access-review__avatar" aria-hidden="true">{request.display_name.slice(0, 1).toUpperCase()}</span><span><strong>{request.display_name}</strong><small>{request.email}</small></span><Icon name="chevron" /></button>)}{!filteredRequests.length && !loadError && <p className="access-review__empty">{search ? 'No applicants match your search.' : 'All caught up. New access requests will appear here.'}</p>}</div>}
      </aside>
      <section className="access-review__detail" aria-label="Application review">
        {selected ? <>
          <button type="button" className="access-review__back" onClick={() => void selectRequest(null)} disabled={locked}>← All requests</button>
          <div className="access-review__identity"><span className="access-review__avatar" aria-hidden="true">{selected.display_name.slice(0, 1).toUpperCase()}</span><div><small>APPLICANT</small><h3 ref={detailHeading} tabIndex={-1}>{selected.display_name}</h3><p>Requested {new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(selected.created_at))}</p></div></div>
          {selected.preferred_room_id && <div className="access-review__preference"><strong>Preferred room: {rooms.find(room => room.id === selected.preferred_room_id)?.room_number ? `Room ${rooms.find(room => room.id === selected.preferred_room_id)?.room_number}` : 'Unavailable'}</strong><span>Final assignment is up to you.</span></div>}
          <dl className="access-review__facts"><div><dt>Email</dt><dd>{selected.email}</dd></div><div><dt>Phone</dt><dd>{selected.phone || 'Not provided'}</dd></div><div><dt>Gender</dt><dd>{selected.gender === 'male' ? 'Male' : selected.gender === 'female' ? 'Female' : 'Not provided'}</dd></div></dl>
          <form onSubmit={submit}>
            <fieldset disabled={locked || loading || Boolean(loadError)} className="access-review__form-fields">
              <legend className="sr-only">Review application</legend>
              <div className="access-review__decision" role="group" aria-label="Review decision">{(['approved', 'rejected'] as const).map(value => <button key={value} type="button" aria-pressed={decision === value} onClick={() => { setDecision(value); setError(''); }}>{value === 'approved' ? 'Approve & assign' : 'Reject request'}</button>)}</div>
              {decision === 'approved' ? <>
                <section className="access-review__room-section"><div className="access-review__section-heading"><h4>Choose a room</h4><button type="button" className="access-review__refresh" onClick={() => void load()}>Refresh availability</button></div><p>Only rooms with space and a matching gender policy can be selected.</p>
                  <label className="access-review__search"><Icon name="search" /><span className="sr-only">Search rooms</span><input type="search" value={roomSearch} onChange={event => setRoomSearch(event.target.value)} placeholder="Search room or floor" /></label>
                  <div className="access-review__floors" role="group" aria-label="Filter rooms by floor">{['all', ...new Set(rooms.map(room => room.floor_label))].map(value => <button key={value} type="button" aria-pressed={floor === value} onClick={() => setFloor(value)}>{value === 'all' ? 'All floors' : value}</button>)}</div>
                  <fieldset className="access-review__rooms"><legend className="sr-only">Available room selection</legend>{visibleRooms.map(room => <label key={room.id} className={`access-review__room${!room.eligible ? ' is-unavailable' : ''}`}><input type="radio" name="room_id" value={room.id} checked={roomId === room.id} disabled={!room.eligible} onChange={() => setRoomId(room.id)} /><span><strong>Room {room.room_number}{selected.preferred_room_id === room.id ? ' · Preferred' : ''}</strong><small>{room.floor_label} · {room.gender_policy === 'male' ? 'Boys only' : room.gender_policy === 'female' ? 'Girls only' : 'Unrestricted'}</small><span>{room.reason || `${room.vacancies} of ${room.capacity} slots available`}</span></span><span className="access-review__rent"><strong>{php(room.monthly_rent)}</strong><small>per tenant / month</small></span></label>)}{!visibleRooms.length && <p className="access-review__empty">No rooms match these filters.</p>}</fieldset>
                </section>
                <section className="access-review__contract"><h4>Rental contract</h4><p>Attach an original PDF or readable image for the tenant. Uploading a contract is optional.</p><div className="access-review__dates"><label>Start date<CalendarDateInput value={startedOn} onValueChange={value => { setStartedOn(value); setEndOverride(null); }} required /></label><label>End date<CalendarDateInput value={endOn ?? ''} onValueChange={setEndOverride} min={startedOn} required /></label></div>
                  <label className="access-review__upload"><Icon name="fileSearch" /><span><strong>{preparing ? 'Preparing image…' : contract ? 'Replace contract file' : 'Choose contract file'}</strong><small>PDF, JPEG or PNG · originals preserved · up to 2 MB</small></span><input type="file" accept="application/pdf,image/jpeg,image/png" onChange={event => void chooseContract(event)} disabled={locked} /></label>
                  {contract && <div className="access-review__preview">{/* Local object URL only; no private document leaves the browser before submission. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {contract.type === 'application/pdf' ? <p>Original PDF selected. Open it on your device to check legibility before approval.</p> : <img src={preview || undefined} alt="Rental contract preview. Check that the text is readable before approval." />}
                    <div><span>{contract.name} · {Math.ceil(contract.size / 1024)} KB</span><button type="button" onClick={() => { setBusy(true); void discardUpload().then(() => { setContract(null); setPreview(''); }).catch(caught => setError(caught instanceof Error ? caught.message : 'Could not remove upload.')).finally(() => setBusy(false)); }}>Remove image</button></div><p>Check names, dates, and signatures in the preview before approving.</p>
                  </div>}
                </section>
              </> : <label className="access-review__reason">Reason for rejection<textarea required minLength={1} maxLength={500} rows={4} value={note} onChange={event => setNote(event.target.value)} placeholder="Explain the decision to the applicant" /></label>}
              <div className="access-review__confirmation">{decision === 'approved' ? chosen ? <p><strong>{selected.display_name}</strong> → Room {chosen.room_number}<br /><span>{php(chosen.monthly_rent)} per tenant / month{contract ? ' · Contract attached' : ' · No contract attached'}</span></p> : <p>Select a room to complete this approval.</p> : <p>The applicant will receive your reason. No room will be assigned.</p>}<button type="submit" className="button button--primary" disabled={locked || loading || Boolean(loadError) || (decision === 'approved' && !chosen)}>{busy ? 'Saving review…' : preparing ? 'Preparing image…' : decision === 'approved' ? 'Confirm approval' : 'Confirm rejection'}</button></div>
            </fieldset>
          </form>
        </> : <div className="access-review__welcome"><Icon name="users" width={36} height={36} /><h3>Give every arrival a clear start</h3><p>Select an applicant to review their details, assign an eligible room, and attach their rental contract.</p></div>}
      </section>
    </div>
  </ResponsiveOverlay>;
}
