'use client';

import { CalendarDateInput } from './CalendarDateInput';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Icon } from './Icon';
import { ProfilePhoto } from './ProfilePhoto';
import { PageHeader, Panel } from './ui';

async function mutate(action: string, data: Record<string, unknown>) { const response = await fetch('/api/storage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, data }) }); const body = await response.json(); if (!response.ok) throw Error(body.message || 'Storage action could not be saved.'); return body; }

function ArchiveTargetPicker({ kind }: { kind: 'tenant' | 'room' }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<{ id: string; label: string; detail?: string }[]>([]);
  const [selected, setSelected] = useState('');
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const response = await fetch(`/api/operations?resource=${kind === 'tenant' ? 'tenants' : 'rooms'}&page=${page}&pageSize=${kind === 'room' ? 100 : 25}&search=${encodeURIComponent(search)}`, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw Error(body.message || 'Choices could not be loaded.');
        if (controller.signal.aborted) return;
        const choices = body.rows.map((row: Record<string, string>) => ({
          id: kind === 'tenant' ? row.user_id : row.id,
          label: kind === 'tenant' ? row.display_name || 'Unnamed tenant' : `Room ${row.room_number}`,
          detail: kind === 'room' ? `${row.floor_label || 'Floor not set'} · ${row.capacity ?? '—'} slots` : undefined,
        }));
        if (kind === 'room') choices.sort((a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, undefined, { numeric: true }));
        setRows(choices);
        setCount(body.count);
      } catch (caught) { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Choices could not be loaded.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [kind, search, page, retry]);
  return <div className="storage-target">
    <label>{kind === 'tenant' ? 'Find a tenant' : 'Search rooms'}<input type="search" value={search} placeholder={kind === 'tenant' ? 'Search by name' : 'Search room number'} onChange={event => { setSearch(event.target.value); setPage(1); setSelected(''); setLoading(true); }} /></label>
    {error ? <p role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></p> : <>
      <div className="tenant-move-flow__list-head">
        <h3>{kind === 'tenant' ? 'Tenants' : 'Rooms'}</h3>
        <span>{count} {kind === 'tenant' ? count === 1 ? 'tenant' : 'tenants' : count === 1 ? 'room' : 'rooms'}</span>
      </div>
      {loading ? <p role="status">Loading {kind === 'tenant' ? 'tenants' : 'rooms'}…</p> : rows.length ? <div className={kind === 'tenant' ? 'tenant-move-flow__rooms export-tenant-grid' : 'tenant-move-flow__rooms'}>
        {rows.map(row => <label className={kind === 'tenant' ? 'tenant-move-flow__room export-tenant-card' : 'tenant-move-flow__room'} key={row.id}>
          <input type="radio" name="target_id" value={row.id} checked={selected === row.id} onChange={() => setSelected(row.id)} required />
          {kind === 'tenant' && <ProfilePhoto className="export-tenant-avatar" userId={row.id} fallback={row.label.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()} />}
          <span><strong>{row.label}</strong>{row.detail && <small>{row.detail}</small>}</span>
        </label>)}
      </div> : <p>No {kind === 'tenant' ? 'tenants' : 'rooms'} match your search.</p>}
    </>}
    {count > (kind === 'room' ? 100 : 25) && <div className="storage-controls"><button type="button" disabled={page === 1 || loading} onClick={() => { setPage(page - 1); setSelected(''); setLoading(true); }}>Previous</button><span>Page {page}</span><button type="button" disabled={page * (kind === 'room' ? 100 : 25) >= count || loading} onClick={() => { setPage(page + 1); setSelected(''); setLoading(true); }}>Next</button></div>}
  </div>;
}

const categories = [
  { value: 'all', label: 'All histories', icon: 'building' },
  { value: 'payments', label: 'Payments', icon: 'wallet' },
  { value: 'rooms', label: 'Rooms', icon: 'map' },
  { value: 'maintenance', label: 'Maintenance', icon: 'wrench' },
  { value: 'concerns', label: 'Concerns', icon: 'sparkles' },
  { value: 'tenants', label: 'Tenants', icon: 'users' },
] as const;

export function StorageManagementWorkspace({ enabled }: { enabled: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [category, setCategory] = useState('all');
  const [step, setStep] = useState(1);
  const [scopeType, setScopeType] = useState('full');
  const [paymentPeriod, setPaymentPeriod] = useState('all');
  const [paymentFrom, setPaymentFrom] = useState('');
  const [paymentTo, setPaymentTo] = useState('');
  const [progress, setProgress] = useState(''), [exportId, setExportId] = useState(''), [completedId, setCompletedId] = useState('');
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);
  const pendingSave = useRef<{ resolve: () => void; reject: (error: Error) => void } | null>(null);
  const abort = useRef<AbortController | null>(null), objectUrl = useRef('');
  useEffect(() => () => { abort.current?.abort(); pendingSave.current?.reject(Error('Export cancelled')); if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);
  async function action(type: string, data: Record<string, unknown>) {
    setBusy(true); setError(''); setMessage('');
    try { await mutate(type, data); setMessage('Saved.'); return true; } catch (caught) { setError(caught instanceof Error ? caught.message : 'Action failed.'); return false; } finally { setBusy(false); }
  }
  async function exportArchive(id: string) {
    if (busy) return;
    setBusy(true); setError(''); setCompletedId(''); setExportId(id); setProgress('Preparing archive…');
    const controller = new AbortController(); abort.current = controller;
    try {
      const { downloadArchive } = await import('../lib/storage/export');
      await downloadArchive(id, (blob, name) => new Promise<void>((resolve, reject) => {
        if (controller.signal.aborted) { reject(Error('Export cancelled')); return; }
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = URL.createObjectURL(blob); pendingSave.current = { resolve, reject }; setDownload({ url: objectUrl.current, name });
      }), value => setProgress(`${value.processed} of ${value.expected} records and files checked · Part ${value.part}`), controller.signal);
      setCompletedId(id); setProgress('All items verified. Check that your downloads finished.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Export failed. Originals were retained.'); }
    finally { setBusy(false); setDownload(null); pendingSave.current = null; abort.current = null; setExportId(''); }
  }
  async function createArchive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget);
    if (['tenant', 'room'].includes(scopeType) && !form.get('target_id')) { setError('Choose a ' + scopeType + ' before exporting.'); return; }
    const from = category === 'payments' && paymentPeriod === 'specific' ? paymentFrom : null;
    const to = category === 'payments' && paymentPeriod === 'specific' ? paymentTo : null;
    if (from && to && from > to) { setError('The start date must be on or before the end date.'); return; }
    const scope = { category, type: from && to ? 'range' : scopeType, target_id: form.get('target_id') || null, from, to, ids: [] };
    setBusy(true); setError(''); setMessage(''); setProgress(''); setCompletedId('');
    try { const result = await mutate('archive.create', scope); setBusy(false); setStep(3); await exportArchive(result.id); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Archive could not be created.'); setBusy(false); }
  }
  function savedPart() { const saved = pendingSave.current; pendingSave.current = null; setDownload(null); saved?.resolve(); }
  function cancelExport() { abort.current?.abort(); pendingSave.current?.reject(Error('Export cancelled. Originals were retained.')); pendingSave.current = null; if (exportId) void mutate('archive.failed', { archive_id: exportId }).catch(() => {}); }
  const steps = ['Choose records', 'Download files'];
  const isReport = download?.name.endsWith('export-report.zip');
  const isIncomplete = download?.name.endsWith('-INCOMPLETE.json');

  return <div className="storage-workspace export-page">
    <Link className="export-back" href="/management">← Back to dashboard</Link>
    <PageHeader title="Export data" />
    <ol className="export-steps" aria-label="Export progress">
      {steps.map((title, index) => <li key={title} aria-current={(step < 3 ? 1 : 2) === index + 1 ? 'step' : undefined}>
        <span>{index + 1}</span>{title}
      </li>)}
    </ol>

    {!enabled ? <Panel title="Export unavailable">
      <p>Storage exports need to be enabled for this workspace.</p>
    </Panel> : <Panel title={step === 1 ? "Choose records" : step === 2 ? "Choose export details" : "Download files"}>
      {error && <p role="alert" className="dashboard-data-error">{error}</p>}
      {message && <p role="status">{message}</p>}
      {step < 3 ? <form key={step} className="export-form export-screen" onSubmit={event => {
        if (step === 1 && category !== 'all') { event.preventDefault(); setError(''); setStep(2); return; }
        void createArchive(event);
      }}>
        <fieldset disabled={busy}>
          <legend>{step === 1 ? "Choose the records you want to export" : "Export options"}</legend>
          {step === 1 && <div className="export-options">
            {categories.map(option => <label key={option.value} className="export-option">
              <input type="radio" name="category" value={option.value} checked={category === option.value}
                onChange={() => { setCategory(option.value); setScopeType('full'); setPaymentPeriod('all'); setError(''); }} />
              <Icon name={option.icon} /><span>{option.label}</span>
            </label>)}
          </div>}
          {step === 2 && <>
            <div className="export-category-heading">
              <span className="export-category-icon"><Icon name={categories.find(option => option.value === category)?.icon ?? 'building'} /></span>
              <div><strong>{categories.find(option => option.value === category)?.label}</strong><p>Choose which records to include in your export.</p></div>
            </div>
            {category !== 'payments' && <fieldset className="export-scope">
              <legend>Records to include</legend>
              <div className="export-scope-options">
                {(['full', category === 'rooms' || category === 'maintenance' ? 'room' : 'tenant'] as const).map(value => {
                  const kind = category === 'rooms' || category === 'maintenance' ? 'room' : 'tenant';
                  return <label className="export-scope-option" key={value}>
                    <input type="radio" name="scope" value={value} checked={scopeType === value} onChange={() => setScopeType(value)} />
                    <span className="export-scope-icon"><Icon name={value === 'full' ? 'building' : kind === 'room' ? 'map' : 'users'} /></span>
                    <span className="export-scope-copy"><strong>{value === 'full' ? `All ${kind}s` : `Specific ${kind}`}</strong><small>{value === 'full' ? `Include records for every ${kind}.` : `Choose one ${kind} to include.`}</small></span>
                  </label>;
                })}
              </div>
            </fieldset>}
            {category !== 'payments' && (scopeType === 'tenant' || scopeType === 'room') && <ArchiveTargetPicker key={scopeType + category} kind={scopeType} />}
            {category === 'payments' && <section className="export-date-section" aria-label="Payment history period">
              <div><strong>Payment history</strong><p>Choose the period to include in this export.</p></div>
              <fieldset className="export-scope">
                <legend className="sr-only">Payment history period</legend>
                <div className="export-scope-options">
                  {[['all', 'All payment history', 'Include all payment records.', 'receipt'], ['specific', 'Specific dates', 'Choose a start and end date.', 'calendar']].map(([value, label, description, icon]) => <label className="export-scope-option" key={value}>
                    <input type="radio" name="payment_period_choice" value={value} checked={paymentPeriod === value} onChange={() => setPaymentPeriod(value)} />
                    <span className="export-scope-icon"><Icon name={icon as 'receipt' | 'calendar'} /></span>
                    <span className="export-scope-copy"><strong>{label}</strong><small>{description}</small></span>
                  </label>)}
                </div>
              </fieldset>
              {paymentPeriod === 'specific' && <div className="export-payment-date">
                <label>Start date<CalendarDateInput name="from" value={paymentFrom} onValueChange={setPaymentFrom} max={paymentTo || undefined} required /></label>
                <label>End date<CalendarDateInput name="to" value={paymentTo} onValueChange={setPaymentTo} min={paymentFrom || undefined} required /></label>
              </div>}
            </section>}
          </>}
          <div className="export-actions">
            {step === 2 && <button type="button" className="button button--secondary" onClick={() => { setError(''); setStep(1); }}>Back</button>}
            <button className="button button--primary">{busy ? 'Preparing…' : step === 1 && category !== 'all' ? 'Continue' : 'Prepare export'}</button>
          </div>
        </fieldset>
      </form> : <>
        {progress && <p role="status">{progress}</p>}
        {download && <div className="export-note">
          <Icon name="download" /><p>{download.name}</p>
        </div>}
        <div className="export-actions">
          {download && <a className="button button--primary" href={download.url} download={download.name} onClick={savedPart}>
            {isIncomplete ? 'Download error report' : isReport ? 'Download export report' : 'Download ZIP part'}
          </a>}
          {exportId && <button type="button" className="button button--secondary" onClick={cancelExport}>Cancel export</button>}
          {completedId && <button type="button" className="button button--primary" disabled={busy} onClick={() => {
            if (window.confirm('Have all ZIP parts and the export report finished downloading, and are they saved on encrypted storage you control?')) {
              void action('archive.confirm', { archive_id: completedId, confirmation: 'DOWNLOADED AND SAFELY STORED' })
                .then(saved => { if (saved) setCompletedId(''); });
            }
          }}>Confirm safe storage</button>}
          {!busy && <button type="button" className="button button--secondary" onClick={() => {
            setProgress(''); setError(''); setMessage(''); setCompletedId(''); setStep(1);
          }}>New export</button>}
        </div>
      </>}
    </Panel>}
  </div>;
}
