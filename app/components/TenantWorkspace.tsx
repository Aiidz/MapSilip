'use client';

import { manilaToday } from '../lib/room-context.mjs';
import { uploadAttachment } from '../lib/uploads/client';
import { CloseIcon } from "./CloseIcon";

import { DataSkeleton } from './DataSkeleton';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createLatestRequest, fetchOperationRows } from '../lib/workspace-loading';
import { Icon } from './Icon';
import { ResponsiveOverlay } from './ResponsiveOverlay';
import { PaymentProofViewer } from './PaymentProofViewer';
import { ConcernSubmissionDetails } from './ConcernSubmissionDetails';
import { MaintenanceSubmissionDetails } from './MaintenanceSubmissionDetails';
import { MobileDetailSurface } from './MobileDetailSurface';
import { TenantDropdown, TenantFileDropzone } from './TenantFormControls';
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
const periodDate = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const paymentDate = (date: unknown) => date ? new Intl.DateTimeFormat('en-PH',{month:'short',day:'numeric',year:'numeric',timeZone:'Asia/Manila'}).format(new Date(String(date))) : '—';

async function operate(action: string, data: Record<string,unknown>) {
  const response = await fetch('/api/operations', { method:'POST', headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ action,data }) });
  if (!response.ok) throw new Error('The request could not be saved. Check the details and try again.');
}


function SubmissionForm({ kind, invoices, open, onClose, onSaved }: {
  kind: Kind; invoices: Row[]; open: boolean; onClose: () => void; onSaved: (invoiceIds?: string[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());

  // Form field states
  const [invoiceIds, setInvoiceIds] = useState<string[] | null>(null);
  const [method, setMethod] = useState('gcash');
  const [cashRecipient, setCashRecipient] = useState('');
  const [qrReady, setQrReady] = useState(false);
  const [category, setCategory] = useState(kind === 'maintenance' ? 'Furniture & Fixtures' : 'Cleanliness & Sanitation');

  const sortedInvoices = [...invoices].sort((a, b) => String(a.coverage_start).localeCompare(String(b.coverage_start)));
  const currentMonth = manilaToday().slice(0, 7);
  const currentInvoice = sortedInvoices.find(row => String(row.coverage_start).startsWith(currentMonth));
  const selectedIds = invoiceIds ?? (currentInvoice ? [String(currentInvoice.id)] : []);
  const selectedInvoices = sortedInvoices.filter(row => selectedIds.includes(String(row.id)));
  const amountInCentavos = selectedInvoices.reduce((total, row) => total + Math.round(Number(row.amount) * 100), 0);

  const methodOptions = [
    { value: 'gcash', label: 'GCash' },
    { value: 'e_wallet', label: 'E-wallet' },
    { value: 'bank_transfer', label: 'Bank' },
    { value: 'cash', label: 'Cash' },
  ];

  const maintenanceCategories = [
    { value: 'Furniture & Fixtures', label: 'Furniture & Fixtures' },
    { value: 'Plumbing', label: 'Plumbing' },
    { value: 'Electrical', label: 'Electrical' },
    { value: 'AC/HVAC', label: 'AC / HVAC' },
    { value: 'Structural & Locks', label: 'Structural & Locks' },
    { value: 'General', label: 'General' },
  ];

  const concernCategories = [
    { value: 'Cleanliness & Sanitation', label: 'Cleanliness & Sanitation' },
    { value: 'Rules & Regulations', label: 'Rules & Regulations' },
    { value: 'Roommate & Visitor Concerns', label: 'Roommate & Visitor Concerns' },
    { value: 'Safety & Privacy', label: 'Safety & Privacy' },
    { value: 'General Feedback', label: 'General Feedback' },
  ];

  function close() { setMessage(''); onClose(); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setMessage('');
    const form = event.currentTarget;
    const fields = new FormData(form);
    try {
      if (kind === 'payments') {
        if (!selectedInvoices.length) throw new Error('Select a payment period.');
        const file = fields.get('file');
        if (method !== 'cash' && (!(file instanceof File) || !file.size)) throw new Error('Select a payment proof.');
        const attachmentId = method === 'cash' ? null : await uploadAttachment(file as File,'payment');
        await operate('payment.submit_periods', {
          request_key: requestKey, invoice_ids: selectedInvoices.map(row => row.id),
          method, cash_recipient: method === 'cash' ? cashRecipient : null,
          reference_number: fields.get('reference_number'), attachment_id: attachmentId,
        });
        setInvoiceIds(null);
      } else if (kind === 'maintenance') {
        const file = fields.get('file');
        const attachmentId = file instanceof File && file.size ? await uploadAttachment(file,'maintenance') : null;
        await operate('maintenance.create',{ request_key:requestKey,category:fields.get('category'),
          description:fields.get('description'),attachment_id:attachmentId });
      } else {
        await operate('concern.create',{ request_key:requestKey,category:fields.get('category'),description:fields.get('description') });
      }
      setRequestKey(crypto.randomUUID());
      form.reset();
      onSaved(kind === 'payments' ? selectedInvoices.map(row => String(row.id)) : undefined);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The request could not be saved.'); }
    finally { setBusy(false); }
  }
  return <ResponsiveOverlay
    open={open}
    onClose={close}
    dismissible={!busy}
    title={kind === 'payments' ? 'Submit payment proof' : kind === 'maintenance' ? 'New maintenance request' : 'New concern or suggestion'}
    variant="dialog"
    className={kind === 'payments' ? 'tenant-submit-payment-overlay' : kind === 'maintenance' ? 'tenant-submit-maintenance-overlay' : 'tenant-submit-concern-overlay'}
  >
    <div className="tenant-form-panel tenant-form-panel--bare">
      <form onSubmit={submit} className="tenant-modal-form">
        {kind === 'payments' ? (
          <>
            <section className="tenant-payment-picker" aria-label="Payment period">
              <div className="tenant-payment-current">
                <span><small>This month</small><strong>{paymentMonth(currentMonth + '-01')}</strong></span>
                <strong>{currentInvoice ? paymentAmount(currentInvoice.amount, currentInvoice.currency) : 'No bill available'}</strong>
              </div>
              {sortedInvoices.length > 0 && <details className="tenant-payment-expand">
                <summary><span><strong>Select payment periods</strong><small>View other months and pay early</small></span>
                  <Icon name="chevron" />
                </summary>
                <fieldset className="tenant-payment-periods" disabled={busy}>
                  <legend className="sr-only">Available payment periods</legend>
                  {sortedInvoices.map(row => {
                    const id = String(row.id);
                    const checked = selectedIds.includes(id);
                    return <label key={id} className="tenant-payment-period">
                      <input type="checkbox" checked={checked} disabled={!checked && selectedInvoices.length >= 12}
                        onChange={event => {
                          const add = event.target.checked;
                          setInvoiceIds(add ? [...selectedIds, id] : selectedIds.filter(value => value !== id));
                          setRequestKey(crypto.randomUUID());
                        }} />
                      <span><strong>{paymentMonth(row.coverage_start)}</strong>
                        <small>{periodDate.formatRange(new Date(String(row.coverage_start)), new Date(String(row.coverage_end)))}</small>
                      </span>
                      <strong>{paymentAmount(row.amount, row.currency)}</strong>
                    </label>;
                  })}
                </fieldset>
              </details>}
            </section>
            <div className="tenant-payment-total" aria-live="polite">
              <span>Total to pay{selectedInvoices.length > 1 ? ` · ${selectedInvoices.length} periods` : ''}</span><strong>{paymentAmount(amountInCentavos / 100)}</strong>
            </div>
            <label>
              <span>Payment method</span>
              <TenantDropdown name="method" value={method} options={methodOptions} required
                onChange={value => { if (value !== method) setQrReady(false); setMethod(value); }} />
            </label>
            {method === 'gcash' && <div>
              <strong>Pay with GCash</strong>
              {/* Serve the original QR pixels without Next image optimization. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/api/paymentqr" alt="GCash merchant QR" width={280}
                style={{ display: qrReady ? 'block' : 'none', maxWidth: '100%', height: 'auto' }}
                onLoad={() => setQrReady(true)} onError={() => setQrReady(false)} />
              {qrReady ? <p>Scan the code or <a href="/api/paymentqr" download="gcash-merchant.png">save it</a>. Confirm the merchant in GCash and pay the full amount before uploading your receipt.</p>
                : <p>The merchant QR is currently unavailable.</p>}
            </div>}
            {method === 'cash' ? <>
              <label>
                <span>Cash handed to</span>
                <TenantDropdown name="cash_recipient" value={cashRecipient} onChange={setCashRecipient}
                  options={[{ value: 'admin', label: 'Admin' }, { value: 'caretaker', label: 'Caretaker' }]}
                  placeholder="Select recipient" required />
              </label>
              <p>Submit after handing over the cash. Payment stays under review until the admin confirms receipt.</p>
            </> : <>
            <label>
              <span>Reference number</span>
              <input
                name="reference_number"
                minLength={3}
                maxLength={100}
                placeholder="Enter reference number"
                required
              />
            </label>
            <label>
              <span>Receipt proof</span>
              <TenantFileDropzone
                name="file"
                accept="image/jpeg,image/png,application/pdf"
                required
                title="Choose receipt file"
                subtitle="Images optimized automatically · PDF up to 2 MB"
              />
            </label>
            </>}
            <button className="button button--primary" type="submit" disabled={busy || !selectedInvoices.length}>
              {busy ? 'Submitting…' : 'Submit for verification'}
            </button>
          </>
        ) : kind === 'maintenance' ? (
          <>
            <label>
              <span>Category</span>
              <TenantDropdown
                name="category"
                value={category}
                onChange={setCategory}
                options={maintenanceCategories}
                required
              />
            </label>
            <label>
              <span>Description</span>
              <textarea
                name="description"
                rows={4}
                minLength={10}
                maxLength={2000}
                placeholder="Describe the repair needed..."
                required
              />
            </label>
            <label>
              <span>Photo or document (optional)</span>
              <TenantFileDropzone
                name="file"
                accept="image/jpeg,image/png,application/pdf"
                title="Choose photo or document"
                subtitle="Images optimized automatically · PDF up to 2 MB"
              />
            </label>
            <button className="button button--primary" type="submit" disabled={busy}>
              {busy ? 'Submitting…' : 'Submit Request'}
            </button>
          </>
        ) : (
          <>
            <label>
              <span>Category</span>
              <TenantDropdown
                name="category"
                value={category}
                onChange={setCategory}
                options={concernCategories}
                required
              />
            </label>
            <label>
              <span>Description</span>
              <textarea
                name="description"
                rows={5}
                minLength={10}
                maxLength={2000}
                placeholder="Describe your concern or suggestion..."
                required
              />
            </label>
            <button className="button button--primary" type="submit" disabled={busy}>
              {busy ? 'Submitting…' : 'Submit Concern'}
            </button>
          </>
        )}
        {message && <p role="alert">{message}</p>}
      </form>
    </div>
  </ResponsiveOverlay>;
}

export function TenantWorkspace({ kind, concernId }: { kind: Kind; concernId?: string }) {
  const item = settings[kind];
  const [showForm,setShowForm] = useState(false);
  const [filter,setFilter] = useState('All');
  const [page,setPage] = useState(1);
  const [rows,setRows] = useState<Row[]>([]);
  const [count,setCount] = useState(0);
  const [selected,setSelected] = useState<Row | null>(null);
  const [invoices,setInvoices] = useState<Row[]>([]);
  const [unavailableInvoices,setUnavailableInvoices] = useState<Set<string>>(() => new Set());
  const [summary,setSummary] = useState<Row | null>(null);
  const [loading,setLoading] = useState(true);
  const [concernLinkError, setConcernLinkError] = useState('');
  const [error,setError] = useState('');
  const requests = useRef(createLatestRequest());
  const load = useCallback(async () => {
    const request = requests.current.start();
    setLoading(true);
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
    if (kind !== 'concerns' || !concernId) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ resource: 'concerns', recordId: concernId });
    fetch('/api/operations?' + query, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error();
        const { rows } = await response.json() as { rows: Row[] };
        if (controller.signal.aborted) return;
        const concern = rows.find(row => row.id === concernId);
        if (concern) setSelected(current => current ?? concern);
        else throw new Error();
      })
      .catch(() => { if (!controller.signal.aborted) setConcernLinkError('This concern could not be opened.'); });
    return () => controller.abort();
  }, [kind, concernId]);
  useEffect(() => {
    const controller = new AbortController();
    if (kind === 'payments') {
      Promise.all([fetchOperationRows('invoices', controller.signal), fetchOperationRows('payments', controller.signal)])
        .then(([invoiceRows, paymentRows]) => {
          if (controller.signal.aborted) return;
          setInvoices(invoiceRows);
          setUnavailableInvoices(new Set(paymentRows.filter(row => row.status === 'approved' || row.status === 'pending')
            .map(row => String(row.invoice_id))));
        })
        .catch(() => { if (!controller.signal.aborted) setError('Invoice details could not be loaded. Refresh this page to retry.'); });
    }
    fetch('/api/dashboard', { signal: controller.signal }).then(response => response.ok ? response.json() : null)
      .then(value => { if (value && !controller.signal.aborted) setSummary(value); }).catch(() => {});
    return () => controller.abort();
  },[kind]);
  const roomLabel = String(summary?.room ?? '').trim();
  const invoice = summary?.next_invoice as Row | undefined;
  const selectedInvoice = invoices.find(row => row.id === selected?.invoice_id);
  const paymentStatus = (status: unknown) => status === 'approved' ? 'Verified' : status === 'pending' ? 'Under Review' : status === 'rejected' ? 'Rejected' : pretty(status);
  return <div className={`tenant-workspace tenant-workspace--${kind}`}>
    <PageHeader title={item.title} description={item.description} />
    <SubmissionForm
      key={kind}
      kind={kind}
      invoices={invoices.filter(row => !unavailableInvoices.has(String(row.id)) && row.currency === 'PHP')}
      open={showForm}
      onClose={() => setShowForm(false)}
      onSaved={paidInvoiceIds => {
        if (paidInvoiceIds) setUnavailableInvoices(current => new Set([...current, ...paidInvoiceIds]));
        setShowForm(false);
        void load();
      }}
    />
    {kind === 'payments' && <section className="tenant-payment-overview" aria-labelledby="next-payment-title">
      <div className="tenant-overview-content"><span className="tenant-summary-icon tenant-summary-icon--solid"><Icon name="wallet" /></span><div><p className="tenant-section-label">Next rent payment</p><h2 id="next-payment-title">{invoice ? paymentAmount(invoice.amount,invoice.currency) : '—'}</h2><p>{invoice ? `${paymentMonth(invoice.coverage_start)} · Due ${paymentDate(invoice.due_on)}` : 'No upcoming invoice is available.'}</p></div></div>
      <button className="tenant-hero-action" type="button" onClick={() => setShowForm(true)} aria-expanded={showForm}>{item.action}</button>
    </section>}
    {kind === 'maintenance' && <section className="tenant-room-summary"><div className="tenant-overview-content"><span className="tenant-summary-icon tenant-summary-icon--solid"><Icon name="wrench" /></span><div><p className="tenant-section-label">Your room</p><h2>{roomLabel ? `Room ${roomLabel.replace(/^room\s+/i, '')}` : 'No room assigned'}</h2><p>Share a maintenance request when needed.</p></div></div>
      <button className="tenant-hero-action" type="button" onClick={() => setShowForm(true)} aria-expanded={showForm}>{item.action}</button></section>}
    {kind === 'concerns' && <section className="tenant-share-panel"><div className="tenant-overview-content"><span className="tenant-summary-icon tenant-summary-icon--solid"><Icon name="sparkles" /></span><div><h2>Have something to share?</h2><p>Your feedback helps improve dormitory living.</p></div></div>
      <button className="tenant-hero-action" type="button" onClick={() => setShowForm(true)} aria-expanded={showForm}>{item.action}</button></section>}
    {error && <p role="alert">{error} <button type="button" onClick={() => void load()}>Retry</button></p>}
    {kind === 'payments' ? <div className="tenant-payment-layout">
      <section className="tenant-payment-history" aria-labelledby="payment-history-title"><h2 id="payment-history-title">Payment History</h2>
        <div className="tenant-filter-row" role="group" aria-label="Payment history filters">{item.filters.map(value => <button key={value} type="button" className={`tenant-filter${filter === value ? ' is-active' : ''}`} aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(1); setSelected(null); }}>{value}</button>)}</div>
        {loading && !rows.length ? <DataSkeleton label="Loading payment history" /> : rows.length ? <div className="tenant-payment-history__items">{rows.map(row => { const billed = invoices.find(item => item.id === row.invoice_id); return <button type="button" className={`tenant-payment-history__item${selected?.id === row.id ? ' is-selected' : ''}`} key={String(row.id)} onClick={() => setSelected(row)}><span><strong>{billed ? paymentMonth(billed.coverage_start) : `Submitted ${paymentDate(row.created_at)}`}</strong><small>{paymentAmount(row.amount,billed?.currency)}</small></span><span className={`tenant-payment-status tenant-payment-status--${String(row.status)}`}>{paymentStatus(row.status)}</span></button>; })}</div> : <EmptyState title="No payments to display" description="Your payment submissions will appear here." icon="receipt" />}
        {count > 25 && <div className="operational-pagination"><button type="button" disabled={page===1} onClick={() => setPage(page-1)}>Previous</button><span>{page} / {Math.ceil(count/25)}</span><button type="button" disabled={page*25>=count} onClick={() => setPage(page+1)}>Next</button></div>}
      </section>
      <MobileDetailSurface open={Boolean(selected)} onClose={() => setSelected(null)} title="Payment Details">
      <section className="tenant-payment-details" aria-labelledby="payment-details-title"><header className="detail-header payment-details-heading"><h2 id="payment-details-title">Payment Details</h2>{selected && <button type="button" className="detail-header__close" onClick={() => setSelected(null)} aria-label="Close payment details"><CloseIcon /></button>}</header>{selected ? <div className="tenant-payment-details__body"><h3>Payment Information</h3><dl>
        <div><dt>Amount</dt><dd>{paymentAmount(selected.amount,selectedInvoice?.currency)}</dd></div><div><dt>Billing Period</dt><dd>{paymentMonth(selectedInvoice?.coverage_start)}</dd></div><div><dt>Payment Method</dt><dd>{pretty(selected.method)}</dd></div><div><dt>Reference Number</dt><dd>{pretty(selected.reference_number)}</dd></div><div><dt>Payment Date</dt><dd>{paymentDate(selected.created_at)}</dd></div>
      </dl><h3>Proof of Payment</h3>{selected.attachment_id ? <PaymentProofViewer key={String(selected.attachment_id)} attachmentId={String(selected.attachment_id)} /> : <p className="tenant-payment-proof">No proof attached</p>}
      <div className={`tenant-payment-verification tenant-payment-verification--${String(selected.status)}`}><strong>{paymentStatus(selected.status)}</strong><p>{selected.status === 'approved' ? 'This payment has been confirmed by the admin.' : selected.status === 'pending' ? 'This payment is awaiting admin review.' : 'This payment was not approved.'}</p>{Boolean(selected.review_note) && <p>{pretty(selected.review_note)}</p>}</div></div> : <EmptyState title="No Payment Selected" description="Select a payment record to view details and review payment proof." icon="fileSearch" />}</section>
      </MobileDetailSurface>
    </div> : <div className="tenant-record-layout">
      <Panel title={item.section} description="Updates about your submissions." icon={kind === 'maintenance' ? 'wrench' : 'sparkles'}>
        {concernLinkError && <p role="alert">{concernLinkError}</p>}
        <div className="tenant-filter-row" role="group" aria-label={`${item.section} filters`}>{item.filters.map(value => <button key={value} type="button" className={`tenant-filter${filter === value ? ' is-active' : ''}`} aria-pressed={filter === value}
          onClick={() => { setFilter(value); setPage(1); setSelected(null); }}>{value}</button>)}</div>
        {loading && !rows.length ? <DataSkeleton /> : rows.length ? <div className="tenant-record-items">{rows.map(row => <button type="button" key={String(row.id)} className={`tenant-record-item${selected?.id === row.id ? ' is-selected' : ''}`} onClick={() => setSelected(row)}>
          <strong>{pretty(row.category)}</strong>
          <span>{new Date(String(row.created_at)).toLocaleDateString()}</span><small>{kind === 'maintenance' && row.status === 'resolved' && row.satisfaction_rating === null ? 'Resolved · Rate repair' : pretty(row.status)}</small>
        </button>)}</div> : <EmptyState title="No records to display" description="Your submissions will appear here when available." icon={kind === 'maintenance' ? 'wrench' : 'sparkles'} />}
        {count > 25 && <div className="operational-pagination"><button type="button" disabled={page === 1} onClick={() => setPage(page-1)}>Previous</button><span>{page} / {Math.ceil(count/25)}</span><button type="button" disabled={page*25 >= count} onClick={() => setPage(page+1)}>Next</button></div>}
      </Panel>
      <MobileDetailSurface open={Boolean(selected)} onClose={() => setSelected(null)} title={kind === 'maintenance' ? 'Maintenance Details' : 'Submission Details'}>
      <Panel title="Submission Details" headerAction={selected && <button type="button" className="detail-header__close" onClick={() => setSelected(null)} aria-label="Close submission details"><CloseIcon /></button>} description="Select a record to view its details." icon="fileSearch" className="tenant-detail-panel">
        {selected && kind === 'maintenance' ? <MaintenanceSubmissionDetails key={String(selected.id)} record={selected} onRate={async (rating, comment) => {
          await operate('maintenance.rate', { id: selected.id, rating, comment });
          const rated: Row = { ...selected, satisfaction_rating: rating, satisfaction_comment: comment };
          setSelected(current => current?.id === selected.id ? rated : current);
          setRows(current => current.map(row => row.id === rated.id ? rated : row));
        }} /> : selected ? <ConcernSubmissionDetails key={String(selected.id)} record={selected} />
          : <EmptyState title="No item selected" description="Details will appear here when a record is available." icon="fileSearch" />}
      </Panel>
      </MobileDetailSurface>
    </div>}
    {kind === 'payments' && <p className="tenant-privacy-note">Payment submissions and receipts are private to your account.</p>}
  </div>;
}

export function TenantNotifications() {
  const [rows,setRows] = useState<Row[]>([]);
  const [query,setQuery] = useState('');
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(true);
  const requests = useRef(createLatestRequest());
  const load = useCallback(async () => {
    const request = requests.current.start();
    setLoading(true);
    try { const response = await fetch(`/api/operations?resource=notifications&search=${encodeURIComponent(query)}`, { signal: request.signal });
      if (!response.ok) throw new Error(); const result = await response.json(); if (!request.isCurrent()) return; setRows(result.rows); setError(''); }
    catch { if (!request.isCurrent()) return; setError('Notifications could not be loaded.'); }
    finally { if (request.isCurrent()) setLoading(false); }
  },[query]);
  useEffect(() => { const activeRequests = requests.current; const timer = window.setTimeout(() => void load(),150); return () => { window.clearTimeout(timer); activeRequests.cancel(); }; },[load]);
  async function markRead(id: string) {
    const response = await fetch('/api/operations',{ method:'POST',headers:{ 'Content-Type':'application/json' },body:JSON.stringify({ action:'notification.read',data:{ id } }) });
    if (response.ok) void load(); else setError('Notification could not be marked read.');
  }
  return <div className="tenant-workspace"><PageHeader title="Notifications" />
    <Panel title="Recent Notifications" icon="bell"><div className="tenant-notification-tools"><label className="tenant-search"><Icon name="search" /><span className="sr-only">Search notifications</span><input type="search" placeholder="Search notifications" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
      {error && <p role="alert">{error} <button type="button" onClick={() => void load()}>Retry</button></p>}
      {loading && !rows.length ? <DataSkeleton label="Loading notifications" /> : rows.length ? <div className="tenant-notification-list">{rows.map(row => <article key={String(row.id)}><a href={String(row.href)}><strong>{pretty(row.title)}</strong><p>{pretty(row.body)}</p></a>{!row.read_at && <button type="button" onClick={() => void markRead(String(row.id))}>Mark read</button>}</article>)}</div>
        : <EmptyState title="No notifications to display" description="New account updates will appear here." icon="bell" />}
    </Panel>
  </div>;
}
