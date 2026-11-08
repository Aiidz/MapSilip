'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ResponsiveOverlay } from './ResponsiveOverlay';
import { EmptyState, PageHeader, Panel } from './ui';
import { manilaToday } from '../lib/room-context.mjs';

type RecordRow = Record<string, unknown>;
type Resource = 'rooms' | 'assignments' | 'tenants' | 'accountRequests' | 'invoices' | 'payments' |
  'maintenance' | 'concerns' | 'visits' | 'notifications';
type Role = 'owner' | 'caretaker' | 'tenant';
const labels: Record<Resource, string> = {
  rooms: 'Rooms', assignments: 'Room assignments', tenants: 'Tenants', accountRequests: 'Access requests',
  invoices: 'Invoices', payments: 'Payment proofs', maintenance: 'Maintenance requests',
  concerns: 'Concerns and suggestions', visits: 'Planned visits', notifications: 'Notifications',
};
const statuses: Partial<Record<Resource, string[]>> = {
  rooms: ['available','reserved','maintenance'], tenants: ['active','inactive'],
  accountRequests: ['pending','approved','rejected','activated'], payments: ['pending','approved','rejected'],
  maintenance: ['pending','in_progress','resolved'], concerns: ['pending','resolved'],
};
const searchable = new Set<Resource>(['rooms','tenants','accountRequests','payments','maintenance','concerns','visits','notifications']);
const columns: Record<Resource, string[]> = {
  rooms: ['room_number','floor_label','capacity','availability'],
  assignments: ['tenant_id','room_id','started_on','ended_on'],
  tenants: ['display_name','phone','status'],
  accountRequests: ['display_name','email','phone','status','created_at'],
  invoices: ['tenant_id','coverage_start','coverage_end','due_on','amount','currency'],
  payments: ['tenant_id','amount','method','reference_number','status','created_at'],
  maintenance: ['category','description','status','staff_response','created_at'],
  concerns: ['description','status','owner_response','created_at'],
  visits: ['visitor_name','visit_on','purpose','cancelled_at'],
  notifications: ['title','body','created_at','read_at'],
};
const uuid = () => crypto.randomUUID();

async function post(action: string, data: Record<string, unknown>) {
  const response = await fetch('/api/operations', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, data }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'The change could not be saved.');
  return result;
}

function Field({ name, label, type = 'text', required = true, options, value }: {
  name: string; label: string; type?: string; required?: boolean; options?: { value: string; label: string }[]; value?: string;
}) {
  return <label className="operational-field">{label}
    {options ? <select name={name} required={required} defaultValue={value ?? ''}>
      <option value="" disabled>Choose {label.toLowerCase()}</option>{options.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
    </select> : type === 'textarea' ? <textarea name={name} required={required} defaultValue={value} rows={3} maxLength={2000} />
      : <input name={name} type={type} required={required} defaultValue={value} maxLength={type === 'text' ? 500 : undefined}
          step={type === 'number' ? name === 'capacity' ? '1' : '0.01' : undefined}
          min={type === 'number' ? name === 'capacity' ? '1' : '0.01' : undefined} />}
  </label>;
}

function display(value: unknown, field: string, references: { tenants: Record<string,string>; rooms: Record<string,string> }) {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'tenant_id' && typeof value === 'string') return references.tenants[value] || value;
  if (field === 'room_id' && typeof value === 'string') return references.rooms[value] || value;
  if (field === 'read_at') return value ? 'Read' : 'Unread';
  if (field === 'cancelled_at') return value ? 'Cancelled' : 'Planned';
  if (field.endsWith('_at') && typeof value === 'string') return new Date(value).toLocaleString();
  return String(value).replaceAll('_',' ');
}

export function OperationalWorkspace({ title, description, resources, role, initialTenantId }: {
  title: string; description: string; resources: Resource[]; role: Role; initialTenantId?: string;
}) {
  const [active, setActive] = useState<Resource>(resources[0]);
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(resources[0] === 'tenants' ? 'active' : '');
  const [notificationRead, setNotificationRead] = useState('unread');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [formAction, setFormAction] = useState('');
  const [renderedAction, setRenderedAction] = useState('');
  const [editing, setEditing] = useState<RecordRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<RecordRow | null>(null);
  const [tenantAction, setTenantAction] = useState<'move' | 'deactivate' | null>(null);
  const [tenantActionMessage, setTenantActionMessage] = useState('');
  const tenantDialog = useRef<HTMLDialogElement>(null);
  const requestKey = useRef<string | null>(null);
  const [references, setReferences] = useState<{ tenants: Record<string,string>; rooms: Record<string,string>; roomRecords: RecordRow[]; invoices: RecordRow[] }>({ tenants: {}, rooms: {}, roomRecords: [], invoices: [] });
  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({ resource: active, page: String(page), search, status });
      if (active === 'concerns' && initialTenantId) query.set('tenantId', initialTenantId);
      if (active === 'notifications') query.set('read', notificationRead);
      const response = await fetch(active === 'tenants'
        ? `/api/tenants/directory?${new URLSearchParams({ page: String(page), pageSize: '25', search, status })}`
        : `/api/operations?${query}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Records could not be loaded.');
      setRows(result.rows); setCount(result.count);
    } catch (error) { setRows([]); setCount(0); setMessage(error instanceof Error ? error.message : 'Records could not be loaded.'); }
    finally { setLoading(false); }
  }, [active,page,search,status,notificationRead,initialTenantId]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => {
    const needed = role === 'owner' ? ['tenants','rooms'] : role === 'tenant' ? ['invoices'] : [];
    Promise.all(needed.map(async resource => {
      const rows: RecordRow[] = [];
      for (let nextPage = 1; nextPage <= 25; nextPage++) {
        const response = await fetch(`/api/operations?resource=${resource}&page=${nextPage}&pageSize=100`);
        if (!response.ok) break;
        const result = await response.json();
        rows.push(...result.rows as RecordRow[]);
        if (rows.length >= result.count || result.rows.length === 0) break;
      }
      return { resource, rows };
    })).then(parts => {
      const next = { tenants: {} as Record<string,string>, rooms: {} as Record<string,string>, roomRecords: [] as RecordRow[], invoices: [] as RecordRow[] };
      for (const part of parts) {
        if (part.resource === 'tenants') for (const row of part.rows) next.tenants[String(row.user_id)] = String(row.display_name);
        if (part.resource === 'rooms') {
          next.roomRecords = part.rows;
          for (const row of part.rows) next.rooms[String(row.id)] = String(row.room_number);
        }
        if (part.resource === 'invoices') next.invoices = part.rows;
      }
      setReferences(next);
    }).catch(() => {});
  }, [role]);
  function switchResource(resource: Resource) { setActive(resource); setPage(1); setSearch(''); setStatus(resource === 'tenants' ? 'active' : ''); setNotificationRead('unread'); setFormAction(''); setEditing(null); setMessage(''); requestKey.current = null; }
  function openTenant(row: RecordRow) {
    setSelectedTenant(row); setTenantAction(null); setTenantActionMessage('');
    tenantDialog.current?.showModal();
  }
  async function submitTenantAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTenant || !tenantAction || busy) return;
    setBusy(true); setTenantActionMessage('');
    try {
      if (tenantAction === 'move') {
        const fields = Object.fromEntries(new FormData(event.currentTarget).entries());
        await post('room.assign', { tenant_id: selectedTenant.user_id, room_id: fields.room_id, started_on: fields.started_on });
      } else {
        const response = await fetch('/api/tenants/directory', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'deactivate', id: selectedTenant.user_id }) });
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.message || 'Tenant access could not be deactivated.');
        }
      }
      tenantDialog.current?.close();
      setSelectedTenant(null); setTenantAction(null);
      setMessage(tenantAction === 'deactivate' ? 'Tenant access deactivated and room assignment ended.' : 'Room assignment saved.');
      await load();
    } catch (error) { setTenantActionMessage(error instanceof Error ? error.message : 'The change could not be saved.'); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form).entries());
    setMessage('');
    try {
      const action = formAction;
      const data: Record<string, unknown> = { ...fields };
      if (editing?.id) data.id = editing.id;
      if (['payment.submit','maintenance.create','concern.create','visit.create'].includes(action)) {
        requestKey.current ??= uuid();
        data.request_key = requestKey.current;
      }
      if (action === 'payment.submit' || action === 'maintenance.create') {
        const file = form.querySelector<HTMLInputElement>('input[name="file"]')?.files?.[0];
        if (action === 'payment.submit' && !file) throw new Error('Select a payment proof.');
        if (file) {
          const payload = new FormData(); payload.set('file', file);
          payload.set('purpose', action === 'payment.submit' ? 'payment' : 'maintenance');
          const upload = await fetch('/api/attachments', { method: 'POST', body: payload });
          const uploadResult = await upload.json();
          if (!upload.ok) throw new Error(uploadResult.message || 'The file could not be uploaded.');
          data.attachment_id = uploadResult.id;
        }
        delete data.file;
      }
      if (action === 'account.review') {
        const response = await fetch('/api/account-requests/review', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editing?.id,
            decision: fields.decision,
            room_id: fields.room_id,
            started_on: fields.started_on,
            note: fields.note,
          }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Review could not be saved.');
        setMessage(result.message || 'Review saved successfully.');
      } else {
        if (action === 'room.assign') data.tenant_id = fields.tenant_id;
        if (action === 'invoice.create') {
          data.tenant_id = fields.tenant_id;
          data.currency = String(fields.currency).trim().toUpperCase();
        }
        await post(action, data);
      }
      setMessage('Saved successfully.'); setFormAction(''); setEditing(null); form.reset();
      requestKey.current = null;
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The change could not be saved.'); }
    finally { setBusy(false); }
  }
  async function quickAction(action: string, row: RecordRow, extra: Record<string, unknown> = {}) {
    try { await post(action, { id: row.id, ...extra }); setMessage('Saved successfully.'); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'The change could not be saved.'); }
  }
  function actionButton(action: string, label: string, row?: RecordRow) {
    return <button type="button" className="button" onClick={() => { setEditing(row || null); setFormAction(action); setRenderedAction(action); setMessage(''); requestKey.current = null; }}>{label}</button>;
  }
  const tenantOptions = Object.entries(references.tenants).map(([value,label]) => ({ value,label }));
  const roomOptions = Object.entries(references.rooms).map(([value,label]) => ({ value,label }));
  const formTitles: Record<string, string> = {
    'room.create': 'Add room',
    'room.update': 'Edit room',
    'room.assign': 'Assign room',
    'invoice.create': 'Create invoice',
    'payment.submit': 'Submit payment proof',
    'payment.review': 'Review payment',
    'maintenance.create': 'Submit maintenance request',
    'maintenance.update': 'Update maintenance request',
    'concern.create': 'Share a concern',
    'concern.respond': 'Respond to concern',
    'visit.create': 'Plan a visit',
    'account.review': 'Review application',
  };
  return <div className="operational-workspace">
    <PageHeader title={title} description={description} />
    {active === 'concerns' && initialTenantId && <p className="operational-filter-note">Showing concerns for the selected tenant. <a href="/management/concerns">View all concerns</a></p>}
    {resources.length > 1 && <nav className="operational-tabs" aria-label={`${title} sections`}>{resources.map(resource =>
      <button type="button" key={resource} aria-current={active === resource ? 'page' : undefined}
        onClick={() => switchResource(resource)}>{labels[resource]}</button>)}</nav>}
    <Panel title={labels[active]} description={`${count} record${count === 1 ? '' : 's'}`} icon="fileSearch">
      <div className="operational-tools">
        {searchable.has(active) && <label>Search<input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>}
        {statuses[active] && <label>Status<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
          <option value="">All</option>{statuses[active]?.map(value => <option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></label>}
        {active === 'notifications' && <div className="notifications-filters" role="group" aria-label="Notification sections">{[['unread','Unread'],['read','Read'],['','All']].map(([value,label]) => <button type="button" key={value} aria-pressed={notificationRead===value} className={notificationRead===value ? 'is-active' : ''} onClick={() => { setNotificationRead(value); setPage(1); }}>{label}</button>)}</div>}
        <button className="button button--secondary" type="button" onClick={() => void load()}>Refresh</button>
      </div>
      <div className="operational-actions">
        {role === 'owner' && active === 'rooms' && <>{actionButton('room.assign','Assign room')}</>}
        {role === 'owner' && active === 'invoices' && actionButton('invoice.create','Create invoice')}
        {role === 'tenant' && active === 'payments' && actionButton('payment.submit','Submit payment proof')}
        {role === 'tenant' && active === 'maintenance' && actionButton('maintenance.create','Submit request')}
        {role === 'tenant' && active === 'concerns' && actionButton('concern.create','Share concern')}
        {role === 'tenant' && active === 'visits' && actionButton('visit.create','Plan visit')}
      </div>
      {message && <p role="status">{message}</p>}
      <ResponsiveOverlay
        open={Boolean(formAction)}
        dismissible={!busy}
        onClose={() => { if (!busy) { setFormAction(''); setMessage(''); requestKey.current = null; } }}
        title={formTitles[renderedAction] ?? 'Edit record'}
        description="Complete the details below. Your changes are saved when you submit."
        variant={['account.review', 'room.assign', 'invoice.create'].includes(renderedAction) ? 'drawer' : 'dialog'}
      >
      {renderedAction && <form key={`${renderedAction}-${String(editing?.id ?? '')}`} className="operational-form" onSubmit={submit}>
        {renderedAction === 'room.create' && <><Field name="room_number" label="Room number" /><Field name="floor_label" label="Floor" /><Field name="capacity" label="Capacity" type="number" /></>}
        {renderedAction === 'room.update' && <><Field name="room_number" label="Room number" value={String(editing?.room_number ?? '')} /><Field name="floor_label" label="Floor" value={String(editing?.floor_label ?? '')} /><Field name="capacity" label="Capacity" type="number" value={String(editing?.capacity ?? '')} /><Field name="availability" label="Availability" options={['available','reserved','maintenance'].map(value => ({ value,label:value }))} value={String(editing?.availability ?? '')} /></>}
        {renderedAction === 'room.assign' && <><Field name="tenant_id" label="Tenant" options={tenantOptions} /><Field name="room_id" label="Room" options={roomOptions} /><Field name="started_on" label="Start date" type="date" /></>}
        {renderedAction === 'invoice.create' && <><Field name="tenant_id" label="Tenant" options={tenantOptions} /><Field name="coverage_start" label="Coverage start" type="date" /><Field name="coverage_end" label="Coverage end (six months minus one day)" type="date" /><Field name="due_on" label="Due date" type="date" /><Field name="amount" label="Amount" type="number" /><Field name="currency" label="Currency code (e.g. PHP)" /><Field name="note" label="Note" required={false} /></>}
        {renderedAction === 'payment.submit' && <><Field name="invoice_id" label="Invoice" options={references.invoices.map(row => ({ value:String(row.id), label:`${row.coverage_start} — ${row.amount} ${row.currency}` }))} /><Field name="amount" label="Amount" type="number" /><Field name="method" label="Method" options={[{ value:'gcash',label:'GCash' },{ value:'bank_transfer',label:'Bank transfer' }]} /><Field name="reference_number" label="Reference number" /><label>Receipt or proof<input name="file" type="file" accept="image/jpeg,image/png,application/pdf" required /></label></>}
        {renderedAction === 'payment.review' && <><Field name="status" label="Decision" options={[{ value:'approved',label:'Approve' },{ value:'rejected',label:'Reject' }]} /><Field name="note" label="Reason if rejected" required={false} /></>}
        {renderedAction === 'maintenance.create' && <><Field name="category" label="Category" /><Field name="description" label="Description" type="textarea" /><label>Photo or document (optional)<input name="file" type="file" accept="image/jpeg,image/png,application/pdf" /></label></>}
        {renderedAction === 'maintenance.update' && <><Field name="status" label="Next status" options={editing?.status === 'pending' ? [{ value:'in_progress',label:'In progress' }] : [{ value:'resolved',label:'Resolved' }]} /><Field name="response" label="Update" type="textarea" required={false} /></>}
        {renderedAction === 'concern.create' && <Field name="description" label="Description" type="textarea" />}
        {renderedAction === 'concern.respond' && <Field name="response" label="Response" type="textarea" />}
        {renderedAction === 'visit.create' && <><Field name="visitor_name" label="Visitor name" /><Field name="visit_on" label="Visit date" type="date" /><Field name="purpose" label="Purpose" /></>}
        {renderedAction === 'account.review' && <>
          <Field name="decision" label="Decision" options={[{ value:'approved',label:'Approve' },{ value:'rejected',label:'Reject' }]} />
          <Field name="room_id" label="Room (Required if approving)" options={roomOptions} required={false} />
          <Field name="started_on" label="Start Date" type="date" required={false} />
          <Field name="note" label="Reason (required if rejecting)" type="textarea" required={false} />
        </>}
        <button type="submit" className="button button--primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button><button type="button" disabled={busy} onClick={() => setFormAction('')}>Cancel</button>
      </form>}
      </ResponsiveOverlay>
      {loading ? <p role="status">Loading records…</p> : rows.length === 0 ? <EmptyState title={active === 'tenants' ? 'No tenants found' : 'No records'} description={active === 'tenants' ? 'Try another search or status filter.' : 'Records will appear here when available.'} icon="fileSearch" /> : active === 'tenants' ?
        <div className="tenant-directory" aria-label="Tenant cards">{rows.map(row => <button type="button" className="tenant-directory__card" key={String(row.user_id)} onClick={() => openTenant(row)}>
          <span className="tenant-directory__portrait" aria-hidden="true"><span>{String(row.display_name || '?').trim().split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</span></span>
          <span className="tenant-directory__meta"><strong>{String(row.display_name || 'Unnamed tenant')}</strong><small>{row.room_number ? `Room ${row.room_number}` : 'Needs a room'}</small></span>
          {!row.room_id && <span className="tenant-directory__badge">Unassigned</span>}
        </button>)}</div> :
        <div className="operational-table-wrap"><table className="operational-table"><thead><tr>{columns[active].map(column => <th key={column}>{column.replaceAll('_',' ')}</th>)}<th>Actions</th></tr></thead><tbody>{rows.map((row,index) => <tr key={String(row.id ?? row.user_id ?? index)}>
          {columns[active].map(column => <td key={column}>{display(row[column],column,references)}</td>)}
          <td className="operational-row-actions">
            {role === 'owner' && active === 'accountRequests' && row.status === 'pending' && actionButton('account.review','Review',row)}
            {role === 'owner' && active === 'rooms' && actionButton('room.update','Edit',row)}
            {role === 'owner' && active === 'payments' && row.status === 'pending' && actionButton('payment.review','Review',row)}
            {role === 'owner' && active === 'concerns' && row.status === 'pending' && actionButton('concern.respond','Respond',row)}
            {role !== 'tenant' && active === 'maintenance' && row.status !== 'resolved' && actionButton('maintenance.update','Update',row)}
            {role === 'tenant' && active === 'visits' && !row.cancelled_at && <button type="button" onClick={() => { if (window.confirm('Cancel this planned visit?')) void quickAction('visit.cancel',row); }}>Cancel</button>}
            {active === 'notifications' && !row.read_at && <button type="button" onClick={() => void quickAction('notification.read',row)}>Mark read</button>}
            {active === 'payments' && Boolean(row.attachment_id) && <a href={`/api/attachments?id=${encodeURIComponent(String(row.attachment_id))}`}>Download proof</a>}
            {active === 'maintenance' && Boolean(row.attachment_id) && <a href={`/api/attachments?id=${encodeURIComponent(String(row.attachment_id))}`}>Download photo</a>}
          </td>
        </tr>)}</tbody></table></div>}
      <div className="operational-pagination"><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {Math.max(1,Math.ceil(count / 25))}</span><button type="button" disabled={page * 25 >= count} onClick={() => setPage(page + 1)}>Next</button></div>
    </Panel>
    <dialog ref={tenantDialog} className="tenant-directory__dialog" aria-labelledby="tenant-directory-title" onCancel={event => { if (busy) event.preventDefault(); }} onClose={() => { setSelectedTenant(null); setTenantAction(null); }}>
      {selectedTenant && <div className="tenant-directory__dialog-inner">
        <header><div><h2 id="tenant-directory-title">{String(selectedTenant.display_name)}</h2><p>{selectedTenant.room_number ? `Room ${selectedTenant.room_number}` : 'No room assigned'} · {String(selectedTenant.status)}</p></div>
          <button type="button" aria-label="Close tenant details" disabled={busy} onClick={() => tenantDialog.current?.close()}>×</button></header>
        <div className="tenant-directory__dialog-body">{tenantActionMessage && <p role="alert" className="tenant-directory__error">{tenantActionMessage}</p>}<div className="tenant-directory__identity"><span className="tenant-directory__portrait" aria-hidden="true"><span>{String(selectedTenant.display_name || '?').trim().split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</span></span><div><strong>{String(selectedTenant.display_name)}</strong><small>{selectedTenant.room_number ? `Room ${selectedTenant.room_number}` : 'Room assignment needed'}</small></div></div>
          <dl className="tenant-directory__details"><div><dt>Email</dt><dd>{display(selectedTenant.email,'email',references)}</dd></div><div><dt>Phone</dt><dd>{display(selectedTenant.phone,'phone',references)}</dd></div><div><dt>Emergency contact</dt><dd>{display(selectedTenant.emergency_contact,'emergency_contact',references)}</dd></div><div><dt>Status</dt><dd>{display(selectedTenant.status,'status',references)}</dd></div><div><dt>Room</dt><dd>{selectedTenant.room_number ? `${selectedTenant.room_number} · ${selectedTenant.floor_label}` : 'Unassigned'}</dd></div><div><dt>Assigned on</dt><dd>{display(selectedTenant.started_on,'started_on',references)}</dd></div></dl>
          {tenantAction === 'move' ? <form className="operational-form tenant-directory__action-form" onSubmit={submitTenantAction}><h3>{selectedTenant.room_id ? 'Move tenant' : 'Assign room'}</h3><label>Available room<select name="room_id" required defaultValue=""><option value="" disabled>Select room</option>{references.roomRecords.filter(room => room.availability === 'available' && room.id !== selectedTenant.room_id).map(room => <option key={String(room.id)} value={String(room.id)}>{String(room.room_number)} · {String(room.floor_label)}</option>)}</select></label><label>Effective date<input name="started_on" type="date" value={manilaToday()} readOnly /></label>{!references.roomRecords.some(room => room.availability === 'available' && room.id !== selectedTenant.room_id) && <p>No other available room records were loaded.</p>}{Boolean(selectedTenant.room_id && String(selectedTenant.started_on) >= manilaToday()) && <p>This tenant was assigned today. A move can be recorded tomorrow so the room history stays accurate.</p>}<div className="tenant-directory__action-buttons"><button className="button button--primary" type="submit" disabled={busy || !references.roomRecords.some(room => room.availability === 'available' && room.id !== selectedTenant.room_id) || Boolean(selectedTenant.room_id && String(selectedTenant.started_on) >= manilaToday())}>{busy ? 'Saving…' : 'Save assignment'}</button><button type="button" onClick={() => setTenantAction(null)}>Cancel</button></div></form>
            : tenantAction === 'deactivate' ? <form className="tenant-directory__action-form" onSubmit={submitTenantAction}><h3>Deactivate tenant access?</h3><p>This ends the active room assignment and blocks the tenant portal. Payments, visits, requests, and account history stay saved.</p><div className="tenant-directory__action-buttons"><button className="button button--danger" type="submit" disabled={busy}>{busy ? 'Deactivating…' : 'Deactivate tenant'}</button><button type="button" onClick={() => setTenantAction(null)}>Cancel</button></div></form>
              : selectedTenant.status === 'active' && <div className="tenant-directory__action-buttons"><button className="button button--secondary" type="button" onClick={() => setTenantAction('move')}>{selectedTenant.room_id ? 'Move to another room' : 'Assign a room'}</button><button className="button button--danger" type="button" onClick={() => setTenantAction('deactivate')}>Remove tenant</button></div>}
        </div>
      </div>}
    </dialog>
  </div>;
}
