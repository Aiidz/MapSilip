'use client';

import { CalendarDateInput } from './CalendarDateInput';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Icon } from './Icon';
import { PageHeader, Panel } from './ui';
import { TenantDropdown } from './TenantFormControls';

async function mutate(action: string, data: Record<string, unknown>) { const response = await fetch('/api/storage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, data }) }); const body = await response.json(); if (!response.ok) throw Error(body.message || 'Storage action could not be saved.'); return body; }

function ArchiveTargetPicker({ kind }: { kind: 'tenant' | 'room' }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<{ id: string; label: string }[]>([]);
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
        const response = await fetch(`/api/operations?resource=${kind === 'tenant' ? 'tenants' : 'rooms'}&page=${page}&pageSize=25&search=${encodeURIComponent(search)}`, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw Error(body.message || 'Choices could not be loaded.');
        if (controller.signal.aborted) return;
        setRows(body.rows.map((row: Record<string, string>) => ({ id: kind === 'tenant' ? row.user_id : row.id, label: kind === 'tenant' ? row.display_name || 'Unnamed tenant' : `Room ${row.room_number} · ${row.floor_label || 'Floor not set'}` })));
        setCount(body.count);
      } catch (caught) { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Choices could not be loaded.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [kind, search, page, retry]);
  return <div className="storage-target">
    {kind === 'tenant' && <label>Find a tenant<input type="search" value={search} placeholder={kind === 'tenant' ? 'Search by name' : 'Search room number'} onChange={event => { setSearch(event.target.value); setPage(1); setSelected(''); setLoading(true); }} /></label>}
    {error ? <p role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></p> : <div className="storage-export-choice"><span>{kind === 'tenant' ? 'Tenant' : 'Room'}</span><TenantDropdown name="target_id" required value={selected} onChange={setSelected} disabled={loading} placeholder={loading ? 'Loading…' : rows.length ? `Choose a ${kind}` : 'No matches'} options={rows.map(row => ({ value: row.id, label: row.label }))} /></div>}
    {count > 25 && <div className="storage-controls"><button type="button" disabled={page === 1 || loading} onClick={() => { setPage(page - 1); setSelected(''); setLoading(true); }}>Previous</button><span>Page {page}</span><button type="button" disabled={page * 25 >= count || loading} onClick={() => { setPage(page + 1); setSelected(''); setLoading(true); }}>Next</button></div>}
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

const scopes = [
  { value: 'full', label: 'All matching records', icon: 'building' },
  { value: 'tenant', label: 'Individual tenant', icon: 'users' },
  { value: 'room', label: 'Individual room', icon: 'wrench' },
  { value: 'range', label: 'Date range', icon: 'calendar' },
] as const;

export function StorageManagementWorkspace({ enabled }: { enabled: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [category, setCategory] = useState('all');
  const [step, setStep] = useState(1);
  const [scopeType, setScopeType] = useState('full');
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
    const scope = { category, type: scopeType, target_id: form.get('target_id') || null, from: form.get('from') || null, to: form.get('to') || null, ids: String(form.get('ids') || '').split(/[\s,]+/).filter(Boolean) };
    setBusy(true); setError(''); setMessage(''); setProgress(''); setCompletedId('');
    try { const result = await mutate('archive.create', scope); setBusy(false); setStep(3); await exportArchive(result.id); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Archive could not be created.'); setBusy(false); }
  }
  function savedPart() { const saved = pendingSave.current; pendingSave.current = null; setDownload(null); saved?.resolve(); }
  function cancelExport() { abort.current?.abort(); pendingSave.current?.reject(Error('Export cancelled. Originals were retained.')); pendingSave.current = null; if (exportId) void mutate('archive.failed', { archive_id: exportId }).catch(() => {}); }
  const steps = ['Choose records', 'Choose scope', 'Download files'];
  const isReport = download?.name.endsWith('export-report.zip');
  const isIncomplete = download?.name.endsWith('-INCOMPLETE.json');

  return <div className="storage-workspace export-page">
    <Link className="export-back" href="/management">← Back to dashboard</Link>
    <PageHeader title="Export data" />
    <ol className="export-steps" aria-label="Export progress">
      {steps.map((title, index) => <li key={title} aria-current={step === index + 1 ? 'step' : undefined}>
        <span>{index + 1}</span>{title}
      </li>)}
    </ol>

    {!enabled ? <Panel title="Export unavailable">
      <p>Storage exports need to be enabled for this workspace.</p>
    </Panel> : <Panel title={steps[step - 1]}>
      {error && <p role="alert" className="dashboard-data-error">{error}</p>}
      {message && <p role="status">{message}</p>}
      {step === 1 ? <form className="export-form" onSubmit={event => {
        event.preventDefault(); setError(''); setStep(2);
      }}>
        <fieldset>
          <legend>Record category</legend>
          <div className="export-options">
            {categories.map(option => <label key={option.value} className="export-option">
              <input type="radio" name="category" value={option.value} checked={category === option.value}
                onChange={() => setCategory(option.value)} />
              <Icon name={option.icon} /><span>{option.label}</span>
            </label>)}
          </div>
          <div className="export-actions"><button className="button button--primary">Continue</button></div>
        </fieldset>
      </form> : step === 2 ? <form className="export-form" onSubmit={event => void createArchive(event)}>
        <fieldset disabled={busy}>
          <legend>{categories.find(option => option.value === category)?.label}</legend>
          <div className="export-options">
            {scopes.map(scope => <label key={scope.value} className="export-option">
              <input type="radio" name="type" value={scope.value} checked={scopeType === scope.value}
                onChange={() => setScopeType(scope.value)} />
              <Icon name={scope.icon} />
              <span>{scope.label}</span>
            </label>)}
          </div>
          {(scopeType === 'tenant' || scopeType === 'room') && <ArchiveTargetPicker key={scopeType} kind={scopeType} />}
          {scopeType === 'range' && <div className="export-dates">
            <label>From<CalendarDateInput name="from" required /></label>
            <label>Through<CalendarDateInput name="to" required /></label>
          </div>}
          <div className="export-note"><Icon name="info" /><p>Exports include Excel files and original attachments. Keep every ZIP part and the export report together on encrypted storage.</p></div>
          <div className="export-actions">
            <button type="button" className="button button--secondary" onClick={() => { setError(''); setStep(1); }}>Back</button>
            <button className="button button--primary">{busy ? 'Preparing…' : 'Prepare export'}</button></div>
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
