'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Panel } from './ui';
import { ResponsiveOverlay } from './ResponsiveOverlay';
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

export function StorageManagementWorkspace({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
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
  async function exportArchive(id: string, retry = false) {
    if (busy) return;
    setBusy(true); setError(''); setCompletedId(''); setExportId(id); setProgress('Preparing archive…');
    const controller = new AbortController(); abort.current = controller;
    try {
      if (retry) await mutate('archive.retry', { archive_id: id });
      const { downloadArchive } = await import('../lib/storage/export');
      await downloadArchive(id, (blob, name) => new Promise<void>((resolve, reject) => {
        if (controller.signal.aborted) { reject(Error('Export cancelled')); return; }
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = URL.createObjectURL(blob); pendingSave.current = { resolve, reject }; setDownload({ url: objectUrl.current, name });
      }), value => setProgress(`${value.processed} of ${value.expected} records and files checked · Part ${value.part}`), controller.signal);
      setCompletedId(id); setProgress('All expected items were checked and download actions completed. Confirm safe external storage separately.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Export failed. Originals were retained.'); }
    finally { setBusy(false); setDownload(null); pendingSave.current = null; abort.current = null; setExportId(''); }
  }
  async function createArchive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget);
    if (['tenant', 'room'].includes(scopeType) && !form.get('target_id')) { setError('Choose a ' + scopeType + ' before exporting.'); return; }
    const scope = { type: form.get('type'), target_id: form.get('target_id') || null, from: form.get('from') || null, to: form.get('to') || null, ids: String(form.get('ids') || '').split(/[\s,]+/).filter(Boolean) };
    setBusy(true); setError('');
    try { const result = await mutate('archive.create', scope); setBusy(false); await exportArchive(result.id); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Archive could not be created.'); setBusy(false); }
  }
  function savedPart() { const saved = pendingSave.current; pendingSave.current = null; setDownload(null); saved?.resolve(); }
  function cancelExport() { abort.current?.abort(); pendingSave.current?.reject(Error('Export cancelled. Originals were retained.')); pendingSave.current = null; if (exportId) void mutate('archive.failed', { archive_id: exportId }).catch(() => {}); }
  return <ResponsiveOverlay open={open} onClose={onClose} dismissible={!busy} title="Export Data" description="Keep a copy of your dormitory records and files." className="storage-dialog">
    <div className="storage-workspace">
    {error && <p role="alert" className="dashboard-data-error">{error}</p>}
    {message && <p role="status">{message}</p>}
      <Panel title="Download a backup" description="Separate Excel files for payments, maintenance and other records, with original photos and documents.">
        <form className="operational-form" onSubmit={event => void createArchive(event)}><fieldset disabled={busy}><div className="storage-export-choice"><span>What would you like to export?</span><TenantDropdown name="type" value={scopeType} onChange={setScopeType} disabled={busy} placeholder="Choose records to export" options={[{value:'full',label:'All dormitory records'},{value:'tenant',label:'Individual tenant'},{value:'room',label:'Room maintenance history'},{value:'range',label:'Date range'}]} /></div>{(scopeType === 'tenant' || scopeType === 'room') && <ArchiveTargetPicker key={scopeType} kind={scopeType} />}{scopeType === 'range' && <><label>From<input type="date" name="from" required /></label><label>Through<input type="date" name="to" required /></label></>}{scopeType === 'selected' && <label>Selected record IDs (comma separated, up to 100)<textarea name="ids" maxLength={4000} required /></label>}<p className="storage-export-note">Save the ZIP, then open the Excel files inside. Larger backups have several parts — keep them all.</p><details className="storage-help"><summary>About your backup</summary><p>Includes business records and original attachments, never passwords or sessions. ZIP files are not encrypted; keep them on an encrypted device or drive. Each export supports up to 25,000 records and 25,000 files. Use a smaller scope for larger collections.</p></details><button className="button button--primary" disabled={busy}>{busy ? 'Preparing…' : 'Create backup'}</button></fieldset></form>
        {progress && <p role="status" aria-live="polite">{progress}</p>}
        {download && <a className="button button--primary" href={download.url} download={download.name} onClick={savedPart}>Download {download.name}</a>}
        {exportId && <button className="button button--secondary" onClick={cancelExport}>Cancel export</button>}
        {completedId && <button className="button button--secondary" disabled={busy} onClick={() => { if (window.confirm('Have every ZIP part and the export report finished downloading, and have you safely stored them on your encrypted owner-controlled device or drive? This confirmation does not authorize deletion.')) void action('archive.confirm', { archive_id: completedId, confirmation: 'DOWNLOADED AND SAFELY STORED' }).then(saved => { if (saved) setCompletedId(''); }); }}>Confirm downloaded archive is safely stored</button>}
      </Panel>

  </div></ResponsiveOverlay>;
}
