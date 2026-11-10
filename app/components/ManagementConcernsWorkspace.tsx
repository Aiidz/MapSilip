'use client';

import { DataSkeleton } from './DataSkeleton';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createLatestRequest } from '../lib/workspace-loading';
import { Icon } from './Icon';
import { ResponsiveOverlay } from './ResponsiveOverlay';
import { EmptyState, PageHeader, Panel } from './ui';

type Row = Record<string, unknown>;
const label = (v: unknown) => v == null || v === '' ? '—' : String(v);

export function ManagementConcernsWorkspace({ initialTenantId }: { initialTenantId?: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [responding, setResponding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const requests = useRef(createLatestRequest());
  const load = useCallback(async () => {
    const request = requests.current.start();
    setLoading(true);
    try {
      const query = new URLSearchParams({ resource: 'concerns', page: String(page), pageSize: '25', search, status });
      if (initialTenantId) query.set('tenantId', initialTenantId);
      const result = await fetch(`/api/operations?${query}`, { signal: request.signal }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.message); return j; });
      if (!request.isCurrent()) return;
      setCount(result.count); setRows(result.rows); setSelected(current => result.rows.find((r: Row) => r.id === current?.id) ?? null); setError('');
    } catch { if (!request.isCurrent()) return; setRows([]); setError('Concern records could not be loaded.'); }
    finally { if (request.isCurrent()) setLoading(false); }
  }, [initialTenantId, search, status, page]);
  useEffect(() => { const activeRequests = requests.current; const timer = window.setTimeout(() => void load(), 120); return () => { window.clearTimeout(timer); activeRequests.cancel(); }; }, [load]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || busy) return;
    const form = event.currentTarget;
    setBusy(true);
    try {
      const res = await fetch('/api/operations', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'concern.respond', data: { id: selected.id, response: new FormData(form).get('response') } }) });
      if (!res.ok) throw new Error(); form.reset(); setResponding(false); await load();
    } catch { setError('The response could not be saved.'); } finally { setBusy(false); }
  }
  return <div className="caretaker-workspace management-concerns">
    <PageHeader title="Concerns & Suggestions" description="Review resident feedback and respond to submissions." />
    <div className="caretaker-maintenance-layout">
      <section className="panel caretaker-request-list concerns-request-list" aria-label="Concerns list">
        <div className="caretaker-room-tools concerns-tools">
          <div className="tenant-list-filter concerns-filter">
            <button type="button" className="tenant-list-filter__trigger" aria-haspopup="listbox" aria-expanded={filterOpen} onClick={() => setFilterOpen(value => !value)}><Icon name="sparkles" /><span>{status ? status === 'pending' ? 'Pending' : 'Resolved' : 'All Concerns'}</span><Icon name="chevron" className="tenant-list-filter__chevron" /></button>
            {filterOpen && <div className="tenant-list-filter__menu concerns-filter__menu" role="listbox" aria-label="Filter concerns by status">{[['','All Concerns'],['pending','Pending'],['resolved','Resolved']].map(([value,text]) => <button type="button" role="option" aria-selected={status===value} className={status===value?'is-selected':''} key={value} onClick={() => { setStatus(value); setPage(1); setFilterOpen(false); }}><Icon name="sparkles" /><span>{text}</span>{status===value && <span className="tenant-list-filter__check" aria-hidden="true">✓</span>}</button>)}</div>}
          </div>
          <label className="caretaker-search"><Icon name="search" /><span className="sr-only">Search concerns</span><input placeholder="Search concerns…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></label>
        </div>
        {error && <p role="alert">{error} <button type="button" onClick={() => void load()}>Retry</button></p>}
        {loading && !rows.length ? <DataSkeleton label="Loading concerns" /> : rows.length ? <div className="caretaker-recent-list">{rows.map(row => <button type="button" key={String(row.id)} className={`caretaker-request-row${selected?.id === row.id ? ' is-selected' : ''}`} onClick={() => { setSelected(row); setResponding(false); }}>
          <span className="caretaker-request-row__top"><strong>{label(row.category) === '—' ? 'Concern' : label(row.category)}</strong><span className={`caretaker-request-row__status caretaker-request-row__status--${label(row.status)}`}>{label(row.status)}</span></span>
          <span className="concern-row-description">{label(row.description)}</span><span className="caretaker-request-row__bottom"><span>Resident submission</span><time>{new Date(String(row.created_at)).toLocaleDateString()}</time></span>
        </button>)}</div> : !error && <EmptyState title="No concerns to display" description={search || status ? 'No concerns match these filters.' : 'Resident submissions will appear here.'} icon="sparkles" />}
        {count > 25 && <div className="operational-pagination"><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>{page} / {Math.ceil(count / 25)}</span><button type="button" disabled={page * 25 >= count} onClick={() => setPage(page + 1)}>Next</button></div>}
      </section>
      <Panel title="Concern Details" className="caretaker-request-details">
        {selected ? <div className="caretaker-selected-details concerns-details">
          <button type="button" className="caretaker-details-close" aria-label="Clear selected concern" onClick={() => setSelected(null)}>×</button><h3>Concern Information</h3>
          <div className="caretaker-details-grid"><p><small>Category</small><strong>{label(selected.category)}</strong></p><p><small>Date Submitted</small><strong>{new Date(String(selected.created_at)).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</strong></p><p><small>Status</small><strong>{label(selected.status)}</strong></p><p><small>Resident</small><strong>Tenant submission</strong></p></div>
          <div className="caretaker-details-description-block"><span>Concern or Suggestion</span><p>{label(selected.description)}</p></div>
          {Boolean(selected.owner_response) && <div className="caretaker-details-history"><strong>Your response</strong><div><p>{label(selected.owner_response)}</p><time>{new Date(String(selected.updated_at)).toLocaleString()}</time></div></div>}
          {selected.status === 'pending' && <button type="button" className="button button--secondary" onClick={() => setResponding(true)}>Respond</button>}
        </div> : <EmptyState title="No concern selected" description="Select a submission from the list to view its details." icon="fileSearch" />}
      </Panel>
    </div>
    <ResponsiveOverlay
      open={responding && Boolean(selected)}
      onClose={() => setResponding(false)}
      title="Respond to concern"
      description="Your response is shared with the resident."
      variant="dialog"
    >
      {selected && <form key={String(selected.id)} className="operational-form caretaker-response-form" onSubmit={save}>
        <p className="concerns-original">{label(selected.description)}</p>
        <label>Response<textarea name="response" defaultValue={label(selected.owner_response) === '—' ? '' : label(selected.owner_response)} rows={4} maxLength={2000} required placeholder="Write a response to the resident…" /></label>
        <div><button className="button button--primary" disabled={busy}>{busy ? 'Saving…' : 'Save Response'}</button><button type="button" className="button button--secondary" onClick={() => setResponding(false)}>Cancel</button></div>
      </form>}
    </ResponsiveOverlay>
  </div>;
}
