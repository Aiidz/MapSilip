'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createLatestRequest, fetchOperationRows } from '../lib/workspace-loading';
import { Icon } from './Icon';
import { ResponsiveOverlay } from './ResponsiveOverlay';
import { EmptyState, PageHeader, Panel } from './ui';

type Kind = 'payments' | 'maintenance' | 'concerns';
type Row = Record<string, unknown>;
const settings = {
  payments: { title:'Payments', description:'Submit rent payment proof and track your payment history.', action:'Submit Payment Proof', section:'Payment History', filters:['All','Under Review','Verified','Rejected'] },
  maintenance: { title:'Maintenance', description:'Report room repairs and track their progress.', action:'Submit Maintenance Request', section:'My Maintenance Requests', filters:['All','Pending','In Progress','Resolved'] },
  concerns: { title:'Concerns & Suggestions', description:'Share a concern or suggestion with the dormitory team.', action:'Submit a Concern', section:'My Submissions', filters:['All','Pending','Resolved'] },
} as const;
const statusFor = (kind: Kind, filter: string) => filter === 'All' ? '' : kind === 'payments'
  ? ({ 'Under Review':'pending', Verified:'approved', Rejected:'rejected' } as Record<string,string>)[filter]
  : filter.toLowerCase().replaceAll(' ','_');
const pretty = (value: unknown) => value == null || value === '' ? '—' : String(value).replaceAll('_',' ');
const paymentAmount = (amount: unknown, currency: unknown = 'PHP') => Number.isFinite(Number(amount))
  ? new Intl.NumberFormat('en-PH',{ style:'currency',currency:String(currency || 'PHP') }).format(Number(amount)) : '—';
const paymentMonth = (date: unknown) => date ? new Intl.DateTimeFormat('en-PH',{month:'long',year:'numeric',timeZone:'Asia/Manila'}).format(new Date(String(date))) : '—';
const paymentDate = (date: unknown) => date ? new Intl.DateTimeFormat('en-PH',{month:'short',day:'numeric',year:'numeric',timeZone:'Asia/Manila'}).format(new Date(String(date))) : '—';

async function operate(action: string, data: Record<string,unknown>) {
  const response = await fetch('/api/operations', { method:'POST', headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ action,data }) });
  if (!response.ok) throw new Error('The request could not be saved. Check the details and try again.');
}

async function upload(file: File, purpose: 'payment' | 'maintenance') {
  const body = new FormData(); body.set('file',file); body.set('purpose',purpose);
  const response = await fetch('/api/attachments',{ method:'POST',body });
  if (!response.ok) throw new Error('The file could not be uploaded. Use a PNG, JPEG, or PDF under 2 MB.');
  const value = await response.json();
  return value.id as string;
}

function SubmissionForm({ kind, invoices, open, onClose, onSaved }: {
  kind: Kind; invoices: Row[]; open: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  function close() { setMessage(''); onClose(); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setMessage('');
    const form = event.currentTarget;
    const fields = new FormData(form);
    try {
      if (kind === 'payments') {
        const file = fields.get('file');
        if (!(file instanceof File) || !file.size) throw new Error('Select a payment proof.');
        const attachmentId = await upload(file,'payment');
        await operate('payment.submit',{ request_key:requestKey, invoice_id:fields.get('invoice_id'),
          amount:fields.get('amount'),method:fields.get('method'),reference_number:fields.get('reference_number'),attachment_id:attachmentId });
      } else if (kind === 'maintenance') {
        const file = fields.get('file');
        const attachmentId = file instanceof File && file.size ? await upload(file,'maintenance') : null;
        await operate('maintenance.create',{ request_key:requestKey,category:fields.get('category'),
          description:fields.get('description'),attachment_id:attachmentId });
      } else {
        await operate('concern.create',{ request_key:requestKey,category:fields.get('category'),description:fields.get('description') });
      }
      setRequestKey(crypto.randomUUID());
      form.reset();
      onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The request could not be saved.'); }
    finally { setBusy(false); }
  }
  return <ResponsiveOverlay
    open={open}
    onClose={close}
    title={kind === 'payments' ? 'Submit payment proof' : kind === 'maintenance' ? 'Submit maintenance request' : 'Share a concern'}
    description={kind === 'payments' ? 'Attach your receipt and reference number for review.' : kind === 'maintenance' ? 'Tell us what needs attention and add a photo if helpful.' : 'Your feedback goes directly to the dormitory team.'}
    variant="dialog"
  >
    <div className="tenant-form-panel tenant-form-panel--bare">
    <form onSubmit={submit}>
      {kind === 'payments' ? <>
        <label>Payment period<select name="invoice_id" required defaultValue=""><option value="" disabled>Select invoice</option>{invoices.map(row =>
          <option key={String(row.id)} value={String(row.id)}>{String(row.coverage_start)} to {String(row.coverage_end)} · {String(row.amount)} {String(row.currency)}</option>)}</select></label>
        <div className="tenant-form-row"><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>Payment date<input type="date" value={new Date().toISOString().slice(0,10)} readOnly /></label></div>
        <label>Payment method<select name="method" required defaultValue=""><option value="" disabled>Select a method</option><option value="gcash">GCash</option><option value="bank_transfer">Bank transfer</option></select></label>
        <label>Reference number<input name="reference_number" minLength={3} maxLength={100} required /></label>
        <label>Receipt or proof<input name="file" type="file" accept="image/jpeg,image/png,application/pdf" required /></label>
      </> : <>
        {kind === 'maintenance' && <label>Category<select name="category" defaultValue="" required><option value="" disabled>Select category</option>
          {['Plumbing','Electrical','AC/HVAC','Furniture & Fixtures','Structural & Locks','General'].map(value => <option key={value}>{value}</option>)}
        </select></label>}
        {kind === 'concerns' && <label>Type<input name="category" minLength={2} maxLength={80} placeholder="Concern or suggestion type" required /></label>}
        <label>Description<textarea name="description" rows={5} minLength={10} maxLength={2000} required /></label>
        {kind === 'maintenance' && <label>Photo or document (optional)<input name="file" type="file" accept="image/jpeg,image/png,application/pdf" /></label>}
      </>}
      <button className="button button--primary" type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit'}</button>
      {message && <p role="alert">{message}</p>}
    </form>
    </div>
  </ResponsiveOverlay>;
}

export function TenantWorkspace({ kind }: { kind: Kind }) {
  const item = settings[kind];
  const [showForm,setShowForm] = useState(false);
  const [filter,setFilter] = useState('All');
  const [page,setPage] = useState(1);
  const [rows,setRows] = useState<Row[]>([]);
  const [count,setCount] = useState(0);
  const [selected,setSelected] = useState<Row | null>(null);
  const [invoices,setInvoices] = useState<Row[]>([]);
  const [summary,setSummary] = useState<Row | null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const requests = useRef(createLatestRequest());
  const load = useCallback(async () => {
    const request = requests.current.start();
    try {
      const query = new URLSearchParams({ resource:kind,page:String(page),status:statusFor(kind,filter) });
      const response = await fetch(`/api/operations?${query}`, { signal: request.signal });
      if (!response.ok) throw new Error();
      const value = await response.json(); if (!request.isCurrent()) return; setRows(value.rows); setCount(value.count); setError('');
    } catch { if (!request.isCurrent()) return; setError('Records could not be loaded.'); }
    finally { if (request.isCurrent()) setLoading(false); }
  },[kind,page,filter]);
  useEffect(() => { const activeRequests = requests.current; const timer = window.setTimeout(() => void load(),0); return () => { window.clearTimeout(timer); activeRequests.cancel(); }; },[load]);
  useEffect(() => {
    const controller = new AbortController();
    if (kind === 'payments') {
      fetchOperationRows('invoices', controller.signal).then(value => { if (!controller.signal.aborted) setInvoices(value); })
        .catch(() => { if (!controller.signal.aborted) setError('Invoice details could not be loaded. Refresh this page to retry.'); });
    }
    fetch('/api/dashboard', { signal: controller.signal }).then(response => response.ok ? response.json() : null)
      .then(value => { if (value && !controller.signal.aborted) setSummary(value); }).catch(() => {});
    return () => controller.abort();
  },[kind]);
  const invoice = summary?.next_invoice as Row | undefined;
  const selectedInvoice = invoices.find(row => row.id === selected?.invoice_id);
  const paymentStatus = (status: unknown) => status === 'approved' ? 'Verified' : status === 'pending' ? 'Under Review' : status === 'rejected' ? 'Rejected' : pretty(status);
  return <div className={`tenant-workspace tenant-workspace--${kind}`}>
    <PageHeader title={item.title} description={item.description} />
    <SubmissionForm key={kind} kind={kind} invoices={invoices} open={showForm} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); void load(); }} />
    {kind === 'payments' && <section className="tenant-payment-overview" aria-labelledby="next-payment-title">
      <div className="tenant-overview-content"><span className="tenant-summary-icon tenant-summary-icon--solid"><Icon name="wallet" /></span><div><p className="tenant-section-label">Next rent payment</p><h2 id="next-payment-title">{invoice ? paymentAmount(invoice.amount,invoice.currency) : '—'}</h2><p>{invoice ? `${paymentMonth(invoice.coverage_start)} · Due ${paymentDate(invoice.due_on)}` : 'No upcoming invoice is available.'}</p></div></div>
      <button className="tenant-hero-action" type="button" onClick={() => setShowForm(true)} aria-expanded={showForm}>{item.action}</button>
    </section>}
    {kind === 'maintenance' && <section className="tenant-room-summary"><div className="tenant-overview-content"><span className="tenant-summary-icon tenant-summary-icon--solid"><Icon name="wrench" /></span><div><p className="tenant-section-label">Your room</p><h2>{summary?.room ? `Room ${summary.room}` : 'No room assigned'}</h2><p>Share a maintenance request when needed.</p></div></div>
      <button className="tenant-hero-action" type="button" onClick={() => setShowForm(true)} aria-expanded={showForm}>{item.action}</button></section>}
    {kind === 'concerns' && <section className="tenant-share-panel"><div className="tenant-overview-content"><span className="tenant-summary-icon tenant-summary-icon--solid"><Icon name="sparkles" /></span><div><h2>Have something to share?</h2><p>Your feedback helps improve dormitory living.</p></div></div>
      <button className="tenant-hero-action" type="button" onClick={() => setShowForm(true)} aria-expanded={showForm}>{item.action}</button></section>}
    {error && <p role="alert">{error} <button type="button" onClick={() => void load()}>Retry</button></p>}
    {kind === 'payments' ? <div className="tenant-payment-layout">
      <section className="tenant-payment-history" aria-labelledby="payment-history-title"><h2 id="payment-history-title">Payment History</h2>
        <div className="tenant-filter-row" role="group" aria-label="Payment history filters">{item.filters.map(value => <button key={value} type="button" className={`tenant-filter${filter === value ? ' is-active' : ''}`} aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(1); setSelected(null); }}>{value}</button>)}</div>
        {loading ? <p role="status">Loading payments…</p> : rows.length ? <div className="tenant-payment-history__items">{rows.map(row => { const billed = invoices.find(item => item.id === row.invoice_id); return <button type="button" className={`tenant-payment-history__item${selected?.id === row.id ? ' is-selected' : ''}`} key={String(row.id)} onClick={() => setSelected(row)}><span><strong>{billed ? paymentMonth(billed.coverage_start) : `Submitted ${paymentDate(row.created_at)}`}</strong><small>{paymentAmount(row.amount,billed?.currency)}</small></span><span className={`tenant-payment-status tenant-payment-status--${String(row.status)}`}>{paymentStatus(row.status)}</span></button>; })}</div> : <EmptyState title="No payments to display" description="Your payment submissions will appear here." icon="receipt" />}
        {count > 25 && <div className="operational-pagination"><button type="button" disabled={page===1} onClick={() => setPage(page-1)}>Previous</button><span>{page} / {Math.ceil(count/25)}</span><button type="button" disabled={page*25>=count} onClick={() => setPage(page+1)}>Next</button></div>}
      </section>
      <section className="tenant-payment-details" aria-labelledby="payment-details-title"><h2 id="payment-details-title">Payment Details</h2>{selected ? <div className="tenant-payment-details__body"><button type="button" className="tenant-payment-details__close" onClick={() => setSelected(null)} aria-label="Close payment details">×</button><h3>Payment Information</h3><dl>
        <div><dt>Amount</dt><dd>{paymentAmount(selected.amount,selectedInvoice?.currency)}</dd></div><div><dt>Billing Period</dt><dd>{paymentMonth(selectedInvoice?.coverage_start)}</dd></div><div><dt>Payment Method</dt><dd>{pretty(selected.method)}</dd></div><div><dt>Reference Number</dt><dd>{pretty(selected.reference_number)}</dd></div><div><dt>Payment Date</dt><dd>{paymentDate(selected.created_at)}</dd></div>
      </dl><h3>Proof of Payment</h3>{selected.attachment_id ? <a className="tenant-payment-proof" href={`/api/attachments?id=${encodeURIComponent(String(selected.attachment_id))}`}><Icon name="receipt" />View uploaded proof</a> : <p className="tenant-payment-proof">No proof attached</p>}
      <div className={`tenant-payment-verification tenant-payment-verification--${String(selected.status)}`}><strong>{paymentStatus(selected.status)}</strong><p>{selected.status === 'approved' ? 'This payment has been confirmed by the admin.' : selected.status === 'pending' ? 'This payment is awaiting admin review.' : 'This payment was not approved.'}</p>{Boolean(selected.review_note) && <p>{pretty(selected.review_note)}</p>}</div></div> : <EmptyState title="No Payment Selected" description="Select a payment record to view details and review payment proof." icon="fileSearch" />}</section>
    </div> : <div className="tenant-record-layout">
      <Panel title={item.section} description="Updates about your submissions." icon={kind === 'maintenance' ? 'wrench' : 'sparkles'}>
        <div className="tenant-filter-row" role="group" aria-label={`${item.section} filters`}>{item.filters.map(value => <button key={value} type="button" className={`tenant-filter${filter === value ? ' is-active' : ''}`} aria-pressed={filter === value}
          onClick={() => { setFilter(value); setPage(1); setSelected(null); }}>{value}</button>)}</div>
        {loading ? <p role="status">Loading records…</p> : rows.length ? <div className="tenant-record-items">{rows.map(row => <button type="button" key={String(row.id)} className={`tenant-record-item${selected?.id === row.id ? ' is-selected' : ''}`} onClick={() => setSelected(row)}>
          <strong>{pretty(row.category)}</strong>
          <span>{new Date(String(row.created_at)).toLocaleDateString()}</span><small>{pretty(row.status)}</small>
        </button>)}</div> : <EmptyState title="No records to display" description="Your submissions will appear here when available." icon={kind === 'maintenance' ? 'wrench' : 'sparkles'} />}
        {count > 25 && <div className="operational-pagination"><button type="button" disabled={page === 1} onClick={() => setPage(page-1)}>Previous</button><span>{page} / {Math.ceil(count/25)}</span><button type="button" disabled={page*25 >= count} onClick={() => setPage(page+1)}>Next</button></div>}
      </Panel>
      <Panel title="Submission Details" description="Select a record to view its details." icon="fileSearch" className="tenant-detail-panel">
        {selected ? <dl className="tenant-selected-details">{Object.entries(selected).filter(([key]) => !['id','tenant_id','request_key','invoice_id','room_id'].includes(key)).map(([key,value]) =>
          <div key={key}><dt>{key.replaceAll('_',' ')}</dt><dd>{pretty(value)}</dd></div>)}
          {Boolean(selected.attachment_id) && <div><dt>Attachment</dt><dd><a href={`/api/attachments?id=${selected.attachment_id}`}>Download file</a></dd></div>}</dl>
          : <EmptyState title="No item selected" description="Details will appear here when a record is available." icon="fileSearch" />}
      </Panel>
    </div>}
    {kind === 'payments' && <p className="tenant-privacy-note">Payment submissions and receipts are private to your account.</p>}
  </div>;
}

export function TenantNotifications() {
  const [rows,setRows] = useState<Row[]>([]);
  const [query,setQuery] = useState('');
  const [error,setError] = useState('');
  const requests = useRef(createLatestRequest());
  const load = useCallback(async () => {
    const request = requests.current.start();
    try { const response = await fetch(`/api/operations?resource=notifications&search=${encodeURIComponent(query)}`, { signal: request.signal });
      if (!response.ok) throw new Error(); const result = await response.json(); if (!request.isCurrent()) return; setRows(result.rows); setError(''); }
    catch { if (!request.isCurrent()) return; setError('Notifications could not be loaded.'); }
  },[query]);
  useEffect(() => { const activeRequests = requests.current; const timer = window.setTimeout(() => void load(),150); return () => { window.clearTimeout(timer); activeRequests.cancel(); }; },[load]);
  async function markRead(id: string) {
    const response = await fetch('/api/operations',{ method:'POST',headers:{ 'Content-Type':'application/json' },body:JSON.stringify({ action:'notification.read',data:{ id } }) });
    if (response.ok) void load(); else setError('Notification could not be marked read.');
  }
  return <div className="tenant-workspace"><PageHeader title="Notifications" description="Updates related to your account and stay." />
    <Panel title="Recent Notifications" description="Your latest account updates." icon="bell"><div className="tenant-notification-tools"><label className="tenant-search"><Icon name="search" /><span className="sr-only">Search notifications</span><input type="search" placeholder="Search notifications" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
      {error && <p role="alert">{error} <button type="button" onClick={() => void load()}>Retry</button></p>}
      {rows.length ? <div className="tenant-notification-list">{rows.map(row => <article key={String(row.id)}><a href={String(row.href)}><strong>{pretty(row.title)}</strong><p>{pretty(row.body)}</p></a>{!row.read_at && <button type="button" onClick={() => void markRead(String(row.id))}>Mark read</button>}</article>)}</div>
        : <EmptyState title="No notifications to display" description="New account updates will appear here." icon="bell" />}
    </Panel>
  </div>;
}
