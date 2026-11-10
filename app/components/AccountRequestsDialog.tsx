'use client';

import { DataSkeleton } from './DataSkeleton';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

type Request = { id: string; display_name: string; email: string; phone: string | null; status: string; created_at: string };
type Room = { id: string; room_number: string; floor_label: string; availability: string };

async function getAll(resource: string, status = '') {
  const rows: Record<string, unknown>[] = [];
  for (let page = 1; page <= 100; page++) {
    const query = new URLSearchParams({ resource, page: String(page), pageSize: '100' });
    if (status) query.set('status', status);
    const response = await fetch(`/api/operations?${query}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Records could not be loaded.');
    rows.push(...result.rows);
    if (rows.length >= result.count || !result.rows.length) break;
  }
  return rows;
}

export function AccountRequestsDialog({ open }: { open: boolean }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selected, setSelected] = useState<Request | null>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [requestRows, roomRows] = await Promise.all([getAll('accountRequests', 'pending'), getAll('rooms')]);
      setRequests(requestRows as Request[]);
      setRooms(roomRows as Room[]);
      setSelected(current => requestRows.find(row => row.id === current?.id) as Request || null);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Requests could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    if (!open) return;
    const node = dialog.current;
    node?.showModal();
    const timer = window.setTimeout(() => void load(), 0);
    return () => { window.clearTimeout(timer); node?.close(); };
  }, [open, load]);
  function close() { dialog.current?.close(); router.replace('/management'); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busy) return;
    const fields = new FormData(event.currentTarget);
    const note = String(fields.get('note') || '').trim();
    if (decision === 'rejected' && !note) { setMessage('Add a reason before rejecting this request.'); return; }
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/account-requests/review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, decision,
          room_id: decision === 'approved' ? fields.get('room_id') : null,
          started_on: decision === 'approved' ? fields.get('started_on') || null : null,
          note: note || null }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Review could not be saved.');
      setMessage(result.message || 'Review saved.');
      setSelected(null);
      await load();
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Review could not be saved.'); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="account-review-dialog" aria-labelledby="account-review-title" onClose={() => router.replace('/management')}>
    <div className="account-review-dialog__header"><div><small>APPLICATIONS</small><h2 id="account-review-title">Access requests</h2></div><button type="button" className="account-review-dialog__close" onClick={close} aria-label="Close access requests">×</button></div>
    <div className="account-review-dialog__body">
      <aside className="account-review-dialog__list" aria-label="Pending requests"><h3>Awaiting review <span>{requests.length}</span></h3>
        {loading && !requests.length ? <DataSkeleton label="Loading account requests" /> : requests.length ? requests.map(request => <button type="button" key={request.id} className={selected?.id === request.id ? 'is-selected' : ''} onClick={() => { setSelected(request); setMessage(''); setDecision('approved'); }}><span className="account-review-dialog__avatar">{request.display_name?.slice(0,1).toUpperCase() || '?'}</span><span><strong>{request.display_name}</strong><small>{request.email}</small></span></button>) : <p>No access requests are waiting for review.</p>}
      </aside>
      <section className="account-review-dialog__details" aria-label="Request details">{selected ? <><div className="account-review-dialog__person"><span className="account-review-dialog__avatar">{selected.display_name?.slice(0,1).toUpperCase() || '?'}</span><div><strong>{selected.display_name}</strong><small>Submitted {new Date(selected.created_at).toLocaleDateString()}</small></div></div>
        <dl><div><dt>Email</dt><dd>{selected.email}</dd></div><div><dt>Phone</dt><dd>{selected.phone || 'Not provided'}</dd></div><div><dt>Status</dt><dd>Pending review</dd></div></dl>
        <form onSubmit={submit}><h3>Review application</h3><div className="account-review-dialog__decisions"><button type="button" className={decision === 'approved' ? 'is-selected' : ''} onClick={() => setDecision('approved')}>Approve &amp; assign room</button><button type="button" className={decision === 'rejected' ? 'is-selected' : ''} onClick={() => setDecision('rejected')}>Reject</button></div>
          {decision === 'approved' ? <div className="account-review-dialog__fields"><label>Available room<select name="room_id" required defaultValue=""><option value="" disabled>Choose a room</option>{rooms.filter(room => room.availability === 'available').map(room => <option key={room.id} value={room.id}>Room {room.room_number} · {room.floor_label}</option>)}</select></label><label>Start date (optional)<input name="started_on" type="date" /></label></div> : <label>Reason for rejection<textarea name="note" required maxLength={500} rows={3} placeholder="Explain the decision to the applicant" /></label>}
          <div className="account-review-dialog__actions"><button type="submit" className="button button--primary" disabled={busy || (decision === 'approved' && !rooms.some(room => room.availability === 'available'))}>{busy ? 'Saving…' : decision === 'approved' ? 'Approve request' : 'Reject request'}</button></div>
        </form></> : <div className="account-review-dialog__empty">Select an applicant to review their request.</div>}</section>
    </div>{message && <p className="account-review-dialog__message" role="status">{message}</p>}
  </dialog>;
}
