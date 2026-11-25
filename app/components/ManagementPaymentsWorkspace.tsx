'use client';

import { CalendarDateInput } from './CalendarDateInput';
import { PaymentProofViewer } from './PaymentProofViewer';
import { ProfilePhoto } from './ProfilePhoto';
import { CloseIcon } from "./CloseIcon";

import { DataSkeleton } from './DataSkeleton';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createLatestRequest, fetchOperationRows } from '../lib/workspace-loading';
import { Icon } from './Icon';
import { FilterDropdown } from './FilterDropdown';
import { ResponsiveOverlay } from './ResponsiveOverlay';
import { MobileDetailSurface } from './MobileDetailSurface';
import { PageHeader } from './ui';

type Row = Record<string,unknown>;
const show = (value: unknown) => value == null || value === '' ? '—' : String(value);

const initials = (name: string) => name.split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase();
const statusLabel = (status: unknown) => status === 'pending' ? 'For Review' : status === 'approved' ? 'Verified' : 'Rejected';
export function ManagementPaymentsWorkspace({ initialSearch = '' }: { initialSearch?: string }) {
  const [rows,setRows] = useState<Row[]>([]);
  const [count,setCount] = useState(0);
  const [page,setPage] = useState(1);
  const [search,setSearch] = useState(initialSearch);
  const [status,setStatus] = useState('');
  const [month,setMonth] = useState('');
  const [summary,setSummary] = useState<Row | null>(null);
  const [selected,setSelected] = useState<Row | null>(null);
  const [creating,setCreating] = useState(false);
  const [tenants,setTenants] = useState<Row[]>([]);
  const [rooms,setRooms] = useState<Row[]>([]);
  const [assignments,setAssignments] = useState<Row[]>([]);
  const [invoices,setInvoices] = useState<Row[]>([]);
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [loading,setLoading] = useState(true);
  const requests = useRef(createLatestRequest());
  const load = useCallback(async () => {
    const request = requests.current.start();
    setLoading(true);
    try {
      const query = new URLSearchParams({ resource:'payments',page:String(page),search,status,month });
      const result = await fetch(`/api/operations?${query}`, { signal: request.signal });
      if (!result.ok) throw new Error();
      const list = await result.json();
      if (!request.isCurrent()) return;
      setRows(list.rows); setCount(list.count); setMessage('');
    } catch { if (!request.isCurrent()) return; setMessage('Payment records could not be loaded.'); }
    finally { if (request.isCurrent()) setLoading(false); }
  },[page,search,status,month]);
  useEffect(() => { const activeRequests = requests.current; const timer = window.setTimeout(() => void load(),150); return () => { window.clearTimeout(timer); activeRequests.cancel(); }; },[load]);
  const summaryRequests = useRef(createLatestRequest());
  const loadSummary = useCallback(async () => {
    const request = summaryRequests.current.start();
    try {
      const response = await fetch('/api/dashboard', { signal: request.signal });
      if (!response.ok) throw new Error();
      const metrics = await response.json();
      if (request.isCurrent()) setSummary(metrics);
    } catch { if (request.isCurrent()) setMessage('Payment summary could not be loaded. Refresh to retry.'); }
  }, []);
  useEffect(() => {
    const activeRequests = summaryRequests.current;
    void loadSummary();
    return () => activeRequests.cancel();
  }, [loadSummary]);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(['tenants','rooms','assignments','invoices'].map(resource => fetchOperationRows(resource, controller.signal)))
      .then(([people,roomList,assignmentList,invoiceList]) => {
        if (controller.signal.aborted) return;
        setTenants(people);setRooms(roomList);setAssignments(assignmentList);setInvoices(invoiceList);
      }).catch(() => { if (!controller.signal.aborted) setMessage('Invoice and tenant details could not be loaded. Refresh this page to retry.'); });
    return () => controller.abort();
  },[]);
  async function exportPayments() {
    if (exporting) return;
    setExporting(true);
    setExportError('');
    try {
      const [tenants, rooms, invoices, payments] = await Promise.all(
        ['tenants', 'rooms', 'invoices', 'payments'].map(resource => fetchOperationRows(resource)),
      );
      const { rentCollectionReport } = await import('../lib/storage/rent-report');
      const now = new Date();
      const workbook = rentCollectionReport({ tenants, rooms, invoices, payments, month, search, status, now });
      const url = URL.createObjectURL(new Blob([workbook], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `MapSilip_Rent_Collection_Report_${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Manila' }).format(now)}.xlsx`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'The payment report could not be downloaded.');
    } finally {
      setExporting(false);
    }
  }
  const overview = summary?.payment_overview as { paid:number;pending:number;overdue:number;verified_this_month:{ currency:string;amount:number }[] } | undefined;
  const monthly = overview?.verified_this_month ?? [];
  const monthlyValue = monthly.length ? monthly.map(item => `${item.currency} ${item.amount}`).join(' · ') : '—';
  const totalInvoices = Number(overview?.paid || 0)+Number(overview?.pending || 0)+Number(overview?.overdue || 0);
  const rate = totalInvoices ? `${Math.round(100*Number(overview?.paid || 0)/totalInvoices)}%` : '—';
  const tenantName = (id: unknown) => show(tenants.find(row => row.user_id === id)?.display_name);
  const roomName = (id: unknown) => {
    const current = assignments.find(row => row.tenant_id === id && !row.ended_on);
    return current ? show(rooms.find(room => room.id === current.room_id)?.room_number) : '—';
  };
  const invoiceCurrency = (id: unknown) => show(invoices.find(row => row.id === id)?.currency);
  async function mutate(action: string, data: Record<string,unknown>) {
    const response = await fetch('/api/operations',{ method:'POST',headers:{ 'Content-Type':'application/json' },body:JSON.stringify({ action,data }) });
    if (!response.ok) throw new Error('The change could not be saved. Check the details and try again.');
  }
  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || busy) return;
    const form = new FormData(event.currentTarget);
    const decision = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (selected.method === 'cash' && decision?.value === 'approved' && form.get('cash_received') !== 'on') { setMessage('Confirm the admin received the cash before approval.'); return; }
    if (selected.method === 'gcash' && decision?.value === 'approved' && form.get('gcash_received') !== 'on') { setMessage('Verify the transaction in the merchant account before approval.'); return; }
    setBusy(true);
    try { await mutate('payment.review',{ id:selected.id,status:(event.nativeEvent as SubmitEvent).submitter instanceof HTMLButtonElement ? ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement).value : form.get('status'),note:form.get('note'),cash_received:form.get('cash_received') === 'on',gcash_received:form.get('gcash_received') === 'on' });
      setSelected(null); setMessage('Payment review saved.'); await Promise.all([load(), loadSummary()]); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Review failed.'); }
    finally { setBusy(false); }
  }
  async function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form).entries());
    setBusy(true);
    try { await mutate('invoice.create',{ ...fields,currency:String(fields.currency).trim().toUpperCase() });
      form.reset(); setCreating(false); setMessage('Invoice created.'); await Promise.all([load(), loadSummary()]); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Invoice could not be created.'); }
    finally { setBusy(false); }
  }
  const currentMonth = new Date().toISOString().slice(0,7);
  return <div className="management-payments">
    <PageHeader title="Payment Records" description="Review and verify tenant payment submissions." action={<div className="payment-header-actions">
      <button className="dashboard-export" type="button" onClick={() => { setCreating(true); setSelected(null); }}>Create Invoice</button>
      <button className="dashboard-export payment-export" type="button" disabled={exporting} onClick={() => void exportPayments()}><Icon name="download" />{exporting ? 'Preparing report…' : 'Export Report'}</button>
      {exportError && <p role="alert">{exportError}</p>}
    </div>} />
    <section className="payment-summary" aria-label="Payment summary">{[
      ['Verified This Month',monthlyValue,'Approved payments this month'],
      ['Collection Rate',rate,'Invoices fully paid'],
      ['For Verification',summary ? show(summary.pending_payments) : '—','Submissions awaiting review'],
      ['Overdue Accounts',summary ? show(overview?.overdue || 0) : '—','Invoices past due'],
    ].map(([title,value,description],index) => <article className={`payment-summary__card${index === 0 ? ' payment-summary__card--highlight' : ''}`} key={title}>
      <span>{title}</span><strong>{value}</strong><small>{description}</small>
    </article>)}</section>
    {message && <p role="status">{message} <button type="button" onClick={() => void Promise.all([load(), loadSummary()])}>Refresh</button></p>}
    <div className={`payment-board${selected ? ' payment-board--details-open' : ''}`}><div className="payment-list-column"><div className="payment-filters" aria-label="Payment record filters">
      <label className="payment-filter payment-filter--search"><Icon name="search" /><input aria-label="Search payment reference or tenant name" placeholder="Search reference or tenant name..." value={search} onChange={event => { setSearch(event.target.value);setPage(1); }} /></label>
      <FilterDropdown label="Submission month" icon="calendar" value={month} onChange={value => { setMonth(value); setPage(1); }} options={[{ value:'',label:'All Months' }, ...Array.from({ length:12 },(_,index) => { const date = new Date(`${currentMonth}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth()-index); return { value:date.toISOString().slice(0,7),label:date.toLocaleString(undefined,{ month:'long',year:'numeric',timeZone:'UTC' }) }; })]} />
      <FilterDropdown label="Payment status" icon="filter" value={status} onChange={value => { setStatus(value); setPage(1); }} options={[{ value:'',label:'All Statuses' },{ value:'pending',label:'For Review' },{ value:'approved',label:'Verified' },{ value:'rejected',label:'Rejected' }]} />
    </div>
      <section className="payment-table-panel" aria-label="Payment submissions"><div className="payment-table-scroll"><table className="payment-table"><thead><tr><th scope="col">Tenant / Room</th><th scope="col">Amount</th><th scope="col">Submitted</th><th scope="col">Status</th></tr></thead>
        <tbody>{loading && !rows.length ? <tr><td colSpan={4}><DataSkeleton label="Loading payment records" variant="table" /></td></tr> : rows.length ? rows.map(row => <tr key={String(row.id)} onClick={() => { setSelected(row);setCreating(false); }} className={selected?.id === row.id ? 'is-selected' : ''}>
          <td><button type="button" className="payment-row-select" onClick={() => { setSelected(row);setCreating(false); }}><ProfilePhoto key={String(row.tenant_id)} className="payment-tenant-avatar" userId={String(row.tenant_id)} fallback={initials(tenantName(row.tenant_id))} /><span><strong>{tenantName(row.tenant_id)}</strong><small>Room {roomName(row.tenant_id)}</small></span></button></td>
          <td>{show(row.amount)} {invoiceCurrency(row.invoice_id)}</td><td>{new Date(String(row.created_at)).toLocaleDateString()}<small className="payment-submitted-time">{new Date(String(row.created_at)).toLocaleTimeString(undefined,{ hour:'numeric',minute:'2-digit' })}</small></td><td><span className={`payment-status payment-status--${row.status}`}>{row.status === 'pending' ? 'For Review' : row.status === 'approved' ? 'Verified' : 'Rejected'}</span></td>
        </tr>) : <tr><td colSpan={4}><div className="payment-empty"><span className="payment-empty__icon"><Icon name="fileSearch" /></span><strong>No payment submissions to display</strong><p>Payment records will appear here when available.</p></div></td></tr>}</tbody>
      </table></div>{count > 25 && <div className="operational-pagination"><button type="button" disabled={page===1} onClick={() => setPage(page-1)}>Previous</button><span>{page} / {Math.ceil(count/25)}</span><button type="button" disabled={page*25>=count} onClick={() => setPage(page+1)}>Next</button></div>}</section>
    </div>
    <MobileDetailSurface open={Boolean(selected)} onClose={() => setSelected(null)} title="Payment Details">
    {selected && <section className="payment-details-panel payment-details-panel--selected" aria-labelledby="payment-details-title"><header className="detail-header payment-details-heading"><h2 id="payment-details-title">Payment Details</h2>{selected && <button className="detail-header__close" type="button" aria-label="Close payment details" onClick={() => setSelected(null)}><CloseIcon /></button>}</header>
      <div className="payment-selected-details tenant-payment-details__body">

        <div className="payment-detail-identity"><ProfilePhoto key={String(selected.tenant_id)} className="payment-tenant-avatar" userId={String(selected.tenant_id)} fallback={initials(tenantName(selected.tenant_id))} /><div><strong>{tenantName(selected.tenant_id)}</strong><small>Room {roomName(selected.tenant_id)}</small></div><span className={`payment-status payment-status--${selected.status}`}>{statusLabel(selected.status)}</span></div>
        <h3>Payment Information</h3><dl className="payment-information">
          <div><dt>Amount</dt><dd>{show(selected.amount)} {invoiceCurrency(selected.invoice_id)}</dd></div>
          {selected.batch_total != null && Number(selected.batch_total) !== Number(selected.amount) &&
            <div><dt>Total covered by this proof</dt><dd>{show(selected.batch_total)} {invoiceCurrency(selected.invoice_id)}</dd></div>}
          <div><dt>Billing Period</dt><dd>{invoices.find(invoice => invoice.id === selected.invoice_id)?.coverage_start ? new Date(String(invoices.find(invoice => invoice.id === selected.invoice_id)?.coverage_start)).toLocaleDateString(undefined,{ month:'long',year:'numeric' }) : '—'}</dd></div>
          <div><dt>Payment Method</dt><dd>{show(selected.method)}</dd></div>
          <div><dt>Reference Number</dt><dd>{show(selected.reference_number)}</dd></div>
          <div><dt>Payment Date</dt><dd>{new Date(String(selected.created_at)).toLocaleDateString()}</dd></div>
        </dl><h3>Proof of Payment</h3>
        {selected.attachment_id ? <PaymentProofViewer key={String(selected.attachment_id)} attachmentId={String(selected.attachment_id)} /> : <p className="tenant-payment-proof">{selected.method === 'cash' ? 'Cash payment — verify receipt before approval.' : 'No payment proof attached.'}</p>}
        {selected.status === 'pending' ? <form className="operational-form payment-detail-form" onSubmit={review}>
          {selected.method === 'cash' && <><p>Cash reported as handed to: {show(selected.cash_recipient)}. Confirm only when the admin has received the money.</p><label><input type="checkbox" name="cash_received" /> I confirm the admin received this cash payment.</label></>}
          {selected.method === 'gcash' && <label><input type="checkbox" name="gcash_received" /> I verified the reference and total payment amount in the GCash merchant account.</label>}
          {selected.batch_total != null && Number(selected.batch_total) !== Number(selected.amount) &&
            <p>Your decision applies to all months covered by this proof.</p>}
          <label>Reason if rejected<textarea name="note" rows={3} maxLength={500} /></label>
          <div className="payment-review-actions"><button className="button payment-review-reject" name="status" value="rejected" disabled={busy}>Reject</button><button className="button payment-review-confirm" name="status" value="approved" disabled={busy}>Confirm Payment</button></div>
        </form> : <div className={`payment-review-result payment-review-result--${selected.status}`}><strong>{selected.status === 'approved' ? '✓ Payment Verified' : 'ⓘ Payment Rejected'}</strong><p>{selected.status === 'approved' ? 'This payment has been confirmed by the admin.' : 'Please contact the admin regarding your payment submission.'}</p>{Boolean(selected.review_note) && <p>{show(selected.review_note)}</p>}</div>}
      </div>
    </section>}
    </MobileDetailSurface>
    <ResponsiveOverlay
      open={creating}
      onClose={() => setCreating(false)}
      title="Create invoice"
      description="Bill a tenant for a coverage period. Amounts are stored in the selected currency."
      variant="drawer"
    >
      <form className="operational-form payment-detail-form" onSubmit={createInvoice}>
        <label>Tenant<select name="tenant_id" required defaultValue=""><option value="" disabled>Select tenant</option>{tenants.map(row => <option key={String(row.user_id)} value={String(row.user_id)}>{show(row.display_name)}</option>)}</select></label>
        <label>Coverage start<CalendarDateInput name="coverage_start" required /></label>
        <label>Coverage end (six months minus one day)<CalendarDateInput name="coverage_end" required /></label>
        <label>Due date<CalendarDateInput name="due_on" required /></label>
        <label>Amount<input name="amount" type="number" min="0.01" step="0.01" required /></label>
        <label>Currency code<input name="currency" maxLength={3} minLength={3} required /></label>
        <label>Note<input name="note" maxLength={500} /></label>
        <div className="ps-overlay__actions"><button className="button button--primary" disabled={busy}>{busy ? 'Creating…' : 'Create Invoice'}</button><button type="button" className="button button--secondary" onClick={() => setCreating(false)}>Cancel</button></div>
      </form>
    </ResponsiveOverlay>
  </div></div>;
}
