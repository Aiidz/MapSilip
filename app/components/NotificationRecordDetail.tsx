'use client';

import { useCallback, useEffect, useState } from 'react';

type Row = Record<string, unknown>;
const display = (value: unknown) => value == null || value === '' ? '—' : String(value);

/** Shows read-only context; workflow changes belong on the linked full page. */
export function NotificationRecordDetail({ eventKey }: { eventKey: string }) {
  const match = /^(payment|maintenance|concern):([0-9a-f-]{36}):/i.exec(eventKey);
  const kind = match?.[1];
  const id = match?.[2];
  const resource = kind === 'payment' ? 'payments' : kind === 'concern' ? 'concerns' : 'maintenance';
  const [record, setRecord] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!id) return;
    try {
      const response = await fetch(`/api/operations?${new URLSearchParams({ resource, recordId: id })}`, { signal });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (!signal?.aborted) setRecord(result.rows[0] ?? null);
    } catch { if (!signal?.aborted) setMessage('Details could not be loaded.'); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [id, resource]);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => { if (!controller.signal.aborted) return load(controller.signal); });
    return () => controller.abort();
  }, [load]);
  if (!match) return null;
  return <section className="notification-record" aria-label="Related record" aria-busy={loading}>
    {message && <p role="status">{message}</p>}
    {loading ? <p role="status">Loading details…</p> : !record ? <p>Record unavailable. <button type="button" onClick={() => { setLoading(true); setMessage(''); void load(); }}>Retry</button></p> : <>
      <dl><div><dt>Current status</dt><dd>{display(record.status).replaceAll('_',' ')}</dd></div>
      {kind === 'payment' ? <><div><dt>Amount</dt><dd>{display(record.amount)}</dd></div><div><dt>Method</dt><dd>{display(record.method)}</dd></div><div><dt>Reference</dt><dd>{display(record.reference_number)}</dd></div></> : <div><dt>Category</dt><dd>{display(record.category)}</dd></div>}</dl>
      {Boolean(record.description) && <p>{display(record.description)}</p>}
      {Boolean(record.owner_response || record.staff_response || record.review_note) && <p>{display(record.owner_response || record.staff_response || record.review_note)}</p>}
      {Boolean(record.attachment_id) && <a className="button button--secondary" href={`/api/attachments?id=${encodeURIComponent(String(record.attachment_id))}`} target="_blank" rel="noopener noreferrer">{kind === 'payment' ? 'View receipt' : 'View attachment'} ↗</a>}
    </>}
  </section>;
}
