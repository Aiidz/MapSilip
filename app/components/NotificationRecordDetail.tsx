'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

type Row = Record<string, unknown>;
const display = (value: unknown) => value == null || value === '' ? '—' : String(value);

/** Uses the same authenticated operations and role checks as the full workspaces. */
export function NotificationRecordDetail({ eventKey, area }: { eventKey: string; area: 'management' | 'caretaker' | 'tenant' }) {
  const match = /^(payment|maintenance|concern):([0-9a-f-]{36}):/i.exec(eventKey);
  const kind = match?.[1];
  const id = match?.[2];
  const resource = kind === 'payment' ? 'payments' : kind === 'concern' ? 'concerns' : 'maintenance';
  const [record, setRecord] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!id) return;
    try {
      const response = await fetch(`/api/operations?${new URLSearchParams({ resource, recordId: id })}`, { signal });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (!signal?.aborted) { setRecord(result.rows[0] ?? null); }
    } catch { if (!signal?.aborted) setMessage('Details could not be loaded. Try again.'); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [id, resource]);
  useEffect(() => {
    const controller = new AbortController();
    // Schedule the request outside effect setup; abort prevents work after unmount.
    void Promise.resolve().then(() => { if (!controller.signal.aborted) return load(controller.signal); });
    return () => controller.abort();
  }, [load]);
  if (!match) return null;
  const canReview = record && (kind === 'maintenance' ? area !== 'tenant' && ['pending','in_progress'].includes(String(record.status)) : area === 'management' && record.status === 'pending');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!record || submitting.current) return;
    const form = new FormData(event.currentTarget);
    const decision = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const note = String(form.get('response') || '').trim();
    if (kind === 'payment' && decision?.value === 'rejected' && !note) { setMessage('Add a reason before rejecting the payment.'); return; }
    if (kind === 'payment' && record.method === 'cash' && decision?.value === 'approved' && form.get('cash_received') !== 'on') { setMessage('Confirm the admin received the cash before approval.'); return; }
    submitting.current = true; setBusy(true); setMessage('');
    try {
      const action = kind === 'payment' ? 'payment.review' : kind === 'concern' ? 'concern.respond' : 'maintenance.update';
      const data = kind === 'payment' ? { id, status: decision?.value, note, cash_received: form.get('cash_received') === 'on' } : kind === 'concern' ? { id, response: note } : { id, response: note, status: record.status === 'pending' ? 'in_progress' : 'resolved' };
      const response = await fetch('/api/operations', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action, data }) });
      if (!response.ok) throw new Error();
      setMessage('Saved.'); await load();
      window.dispatchEvent(new Event('mapsilip-notifications-updated'));
    } catch { setMessage('The change could not be saved. Check the full page for the latest status.'); await load(); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <section className="notification-record" aria-label="Related record" aria-busy={loading}>
    {message && <p role="status">{message}</p>}
    {loading ? <p role="status">Loading details…</p> : !record ? <p>Record unavailable. <button type="button" onClick={() => { setLoading(true); setMessage(''); void load(); }}>Retry</button></p> : <>
      <dl><div><dt>Current status</dt><dd>{display(record.status).replaceAll('_',' ')}</dd></div>
      {kind === 'payment' ? <><div><dt>Amount</dt><dd>{display(record.amount)}</dd></div><div><dt>Method</dt><dd>{display(record.method)}</dd></div><div><dt>Reference</dt><dd>{display(record.reference_number)}</dd></div></> : <div><dt>Category</dt><dd>{display(record.category)}</dd></div>}</dl>
      {Boolean(record.description) && <p>{display(record.description)}</p>}
      {Boolean(record.owner_response || record.staff_response || record.review_note) && <p>{display(record.owner_response || record.staff_response || record.review_note)}</p>}
      {Boolean(record.attachment_id) && <a className="button button--secondary" href={`/api/attachments?id=${encodeURIComponent(String(record.attachment_id))}`} target="_blank" rel="noopener noreferrer">{kind === 'payment' ? 'View receipt' : 'View attachment'} ↗</a>}
      {canReview && <form className="operational-form" onSubmit={save}>
        {kind === 'payment' && record.method === 'cash' && <><p>Cash handed to {display(record.cash_recipient)}. Approve only after admin receipt.</p><label><input type="checkbox" name="cash_received" disabled={busy} /> Admin received the cash</label></>}
        <label>{kind === 'payment' ? 'Review note' : 'Response'}<textarea name="response" rows={3} required={kind === 'concern'} maxLength={kind === 'payment' ? 500 : 2000} disabled={busy} /></label>
        <div className="notifications-detail__actions">
          {kind === 'payment' ? <><button className="button button--secondary" value="rejected" disabled={busy}>Reject</button><button className="button button--primary" value="approved" disabled={busy}>Confirm payment</button></> : <button className="button button--primary" disabled={busy}>{busy ? 'Saving…' : kind === 'concern' ? 'Send response' : record.status === 'pending' ? 'Start work' : 'Mark resolved'}</button>}
        </div>
      </form>}
    </>}
  </section>;
}
