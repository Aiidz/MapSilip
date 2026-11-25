'use client';

import { CloseIcon } from "./CloseIcon";
import { DataSkeleton } from './DataSkeleton';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createLatestRequest, fetchOperationRows } from '../lib/workspace-loading';
import { Icon } from './Icon';
import { MobileDetailSurface } from './MobileDetailSurface';
import { ProfilePhoto } from './ProfilePhoto';
import { ResponsiveOverlay } from './ResponsiveOverlay';
import { EmptyState, PageHeader, Panel } from './ui';

type Row = Record<string, unknown>;
const label = (v: unknown) => v == null || v === '' ? '—' : String(v);

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '—';
}

function formatDateTime(value: unknown) {
  const date = new Date(String(value ?? ''));
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ManagementConcernsWorkspace({ initialTenantId, concernId }: { initialTenantId?: string; concernId?: string }) {
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

  const [tenants, setTenants] = useState<Row[]>([]);
  const [rooms, setRooms] = useState<Row[]>([]);
  const [assignments, setAssignments] = useState<Row[]>([]);

  const openLinkedConcern = useRef(Boolean(concernId));
  const requests = useRef(createLatestRequest());
  const load = useCallback(async () => {
    const request = requests.current.start();
    setLoading(true);
    try {
      const query = new URLSearchParams({ resource: 'concerns', page: String(page), pageSize: '25', search, status });
      if (concernId) query.set('recordId', concernId);
      if (initialTenantId) query.set('tenantId', initialTenantId);
      const result = await fetch(`/api/operations?${query}`, { signal: request.signal }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.message); return j; });
      if (!request.isCurrent()) return;
      const openLinked = openLinkedConcern.current;
      openLinkedConcern.current = false;
      setCount(result.count);
      setRows(result.rows);
      setSelected(current => result.rows.find((row: Row) => row.id === (openLinked ? concernId : current?.id)) ?? null);
      setError(openLinked && !result.rows.length ? 'This concern could not be opened.' : '');
    } catch { if (!request.isCurrent()) return; setRows([]); setError('Concern records could not be loaded.'); }
    finally { if (request.isCurrent()) setLoading(false); }
  }, [initialTenantId, concernId, search, status, page]);

  useEffect(() => { const activeRequests = requests.current; const timer = window.setTimeout(() => void load(), 120); return () => { window.clearTimeout(timer); activeRequests.cancel(); }; }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all(['tenants', 'rooms', 'assignments'].map(resource => fetchOperationRows(resource, controller.signal)))
      .then(([people, roomList, assignmentList]) => {
        if (controller.signal.aborted) return;
        setTenants(people);
        setRooms(roomList);
        setAssignments(assignmentList);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const tenantName = (id: unknown) => {
    const profile = tenants.find(row => row.user_id === id);
    return profile?.display_name ? String(profile.display_name) : 'Resident submission';
  };

  const roomLabel = (id: unknown) => {
    const current = assignments.find(row => row.tenant_id === id && !row.ended_on);
    if (!current) return '';
    const room = rooms.find(r => r.id === current.room_id);
    return room?.room_number ? `Room ${room.room_number}` : '';
  };

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
    <PageHeader title="Concerns & Suggestions" />
    {concernId && <a href="/management/concerns">View all concerns</a>}
    <div className="caretaker-maintenance-layout concerns-maintenance-layout">
      <section className="panel caretaker-request-list concerns-request-list" aria-label="Concerns list">
        <div className="caretaker-room-tools concerns-tools">
          <div className="tenant-list-filter concerns-filter">
            <button type="button" className="tenant-list-filter__trigger" aria-haspopup="listbox" aria-expanded={filterOpen} onClick={() => setFilterOpen(value => !value)}><Icon name="sparkles" /><span>{status ? status === 'pending' ? 'Pending' : 'Resolved' : 'All Concerns'}</span><Icon name="chevron" className="tenant-list-filter__chevron" /></button>
            {filterOpen && <div className="tenant-list-filter__menu concerns-filter__menu" role="listbox" aria-label="Filter concerns by status">{[['','All Concerns'],['pending','Pending'],['resolved','Resolved']].map(([value,text]) => <button type="button" role="option" aria-selected={status===value} className={status===value?'is-selected':''} key={value} onClick={() => { setStatus(value); setPage(1); setFilterOpen(false); }}><Icon name="sparkles" /><span>{text}</span>{status===value && <span className="tenant-list-filter__check" aria-hidden="true">✓</span>}</button>)}</div>}
          </div>
          <label className="caretaker-search"><Icon name="search" /><span className="sr-only">Search concerns</span><input placeholder="Search concerns…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></label>
        </div>
        {error && <p role="alert">{error} <button type="button" onClick={() => void load()}>Retry</button></p>}
        {loading && !rows.length ? <DataSkeleton label="Loading concerns" /> : rows.length ? <div className="caretaker-recent-list concerns-recent-list">{rows.map(row => {
          const room = roomLabel(row.tenant_id);
          const rowStatus = label(row.status);
          return <button type="button" key={String(row.id)} className={`caretaker-request-row concerns-request-row${selected?.id === row.id ? ' is-selected' : ''}`} onClick={() => { setSelected(row); setResponding(false); }}>
            <span className="caretaker-request-row__top">
              <strong>{label(row.category) === '—' ? 'Concern' : label(row.category)}</strong>
              <span className={`concern-status-badge concern-status-badge--${rowStatus}`}>{rowStatus}</span>
            </span>
            <span className="caretaker-request-row__bottom">
              <span>{room || 'Room not specified'}</span>
              <time dateTime={String(row.created_at)}>{new Date(String(row.created_at)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time>
            </span>
          </button>;
        })}</div> : !error && <EmptyState title="No concerns to display" description={search || status ? 'No concerns match these filters.' : 'Resident submissions will appear here.'} icon="sparkles" />}
        {count > 25 && <div className="operational-pagination"><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>{page} / {Math.ceil(count / 25)}</span><button type="button" disabled={page * 25 >= count} onClick={() => setPage(page + 1)}>Next</button></div>}
      </section>

      <MobileDetailSurface open={Boolean(selected)} onClose={() => setSelected(null)} title="Concern Details">
        <Panel title="Concern Details" headerAction={selected && <button type="button" className="detail-header__close" aria-label="Clear selected concern" onClick={() => setSelected(null)}>
                  <CloseIcon />
                </button>} className="caretaker-request-details concerns-details-panel">
          {selected ? <div className="caretaker-selected-details concerns-details">
            <div className="concern-detail-header">
              <div className="concern-detail-identity">
                <ProfilePhoto
                  key={String(selected.tenant_id)}
                  className="concern-tenant-avatar"
                  userId={selected.tenant_id ? String(selected.tenant_id) : undefined}
                  fallback={initials(tenantName(selected.tenant_id))}
                />
                <div className="concern-detail-identity__meta">
                  <div className="concern-detail-identity__title">
                    <strong>{tenantName(selected.tenant_id)}</strong>
                    {roomLabel(selected.tenant_id) && <span className="concern-room-pill">{roomLabel(selected.tenant_id)}</span>}
                  </div>
                  <div className="concern-detail-identity__sub">
                    <span className="concern-category-tag"><Icon name="sparkles" />{label(selected.category)}</span>
                    <span className="concern-date-tag">Submitted {formatDateTime(selected.created_at)}</span>
                  </div>
                </div>
              </div>
              <div className="concern-detail-header__actions">
                <span className={`concern-status-badge concern-status-badge--${label(selected.status)}`}>
                  {label(selected.status)}
                </span>

              </div>
            </div>

            <div className="concern-body-thread">
              <section className="concern-thread-card concern-thread-card--resident" aria-label="Resident concern">
                <div className="concern-thread-card__header">
                  <span className="concern-thread-card__label">Concern or Suggestion</span>
                  <time className="concern-thread-card__time">{formatDateTime(selected.created_at)}</time>
                </div>
                <p className="concern-thread-card__content">{label(selected.description)}</p>
              </section>

              {Boolean(selected.owner_response) ? (
                <section className="concern-thread-card concern-thread-card--management" aria-label="Management response">
                  <div className="concern-thread-card__header">
                    <span className="concern-thread-card__label">
                      <span className="concern-thread-card__badge-check" aria-hidden="true">✓</span> Your response
                    </span>
                    {Boolean(selected.updated_at) && <time className="concern-thread-card__time">{formatDateTime(selected.updated_at)}</time>}
                  </div>
                  <p className="concern-thread-card__content">{label(selected.owner_response)}</p>
                  <div className="concern-thread-card__footer">
                    <button type="button" className="button button--secondary concern-thread-edit-button" onClick={() => setResponding(true)}>
                      Update Response
                    </button>
                  </div>
                </section>
              ) : (
                <div className="concern-empty-response-prompt">
                  <div className="concern-empty-response-prompt__info">
                    <strong>Awaiting Management Response</strong>
                    <p>Review this submission and share a response with the resident.</p>
                  </div>
                  <button type="button" className="button button--primary concern-respond-cta" onClick={() => setResponding(true)}>
                    Respond to Concern
                  </button>
                </div>
              )}
            </div>
          </div> : <EmptyState title="No concern selected" description="Select a submission from the list to view its details." icon="fileSearch" />}
        </Panel>
      </MobileDetailSurface>
    </div>

    <ResponsiveOverlay
      open={responding && Boolean(selected)}
      onClose={() => setResponding(false)}
      title="Respond to concern"
      className="request-response-overlay"
      description="Your response is shared with the resident."
      variant="dialog"
    >
      {selected && <form key={String(selected.id)} className="operational-form caretaker-response-form concerns-response-form" onSubmit={save}>
        <div className="concerns-modal-original">
          <span className="concerns-modal-original__label">Resident Submission</span>
          <p className="concerns-original">{label(selected.description)}</p>
        </div>
        <label>Response
          <textarea
            name="response"
            defaultValue={label(selected.owner_response) === '—' ? '' : label(selected.owner_response)}
            rows={4}
            maxLength={2000}
            required
            placeholder="Write a response to the resident…"
          />
        </label>
        <div className="concerns-modal-actions">
          <button type="button" className="button button--secondary" onClick={() => setResponding(false)}>Cancel</button>
          <button type="submit" className="button button--primary" disabled={busy}>{busy ? 'Saving…' : 'Save Response'}</button>
        </div>
      </form>}
    </ResponsiveOverlay>
  </div>;
}
