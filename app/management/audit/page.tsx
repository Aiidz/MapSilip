import Link from 'next/link';
import { AuditFilters } from './AuditFilters';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/ui';
import { requireStaffPortalAccess } from '../../lib/backend/server';
import { createSupabaseServerClient } from '../../lib/supabase/server';

const pageSize = 10;
const financeCategory = { label: 'Rent & payments', pattern: 'invoice.%,payment.%,payment_qr.%' };
const categories = new Map([
  ['finance', financeCategory],
  ['rooms', { label: 'Room management', pattern: 'room.%' }],
  ['access', { label: 'Tenant & account access', pattern: 'tenant.%,account_request.%' }],
  ['contracts', { label: 'Contracts & renewals', pattern: 'contract.%,tenant.contract_expired' }],
  ['maintenance', { label: 'Maintenance', pattern: 'maintenance.%' }],
  ['concerns', { label: 'Concerns & suggestions', pattern: 'concern.%' }],
]);
const tenancyCategory = { label: 'Rooms & tenant access', pattern: 'room.%,tenant.%,account_request.%,contract.%' };

function categoryFilter(pattern: string) {
  return pattern.split(',').map(prefix => `action.like.${prefix}`).join(',');
}
const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila',
});
const timeFormat = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Manila',
});

export default async function AuditTrail({ searchParams }: {
  searchParams: Promise<{ page?: string; search?: string; category?: string; role?: string }>;
}) {
  await requireStaffPortalAccess('owner');
  const params = await searchParams;
  const requestedPage = Number(params.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 10000 ? requestedPage : 1;
  const search = typeof params.search === 'string' ? params.search.trim().slice(0, 80) : '';
  const requestedCategory = typeof params.category === 'string' ? params.category : '';
  const selectedCategory = requestedCategory === 'tenancy' ? tenancyCategory : categories.get(requestedCategory);
  const category = selectedCategory ? requestedCategory : '';
  const client = await createSupabaseServerClient();
  const role = params.role === 'owner' || params.role === 'caretaker' || params.role === 'tenant' ? params.role : '';
  const columns = 'id,created_at,actor_id,action,record_id,reason';
  let query = role
    ? client.rpc('audit_events_by_actor_role', { actor_role: role }, { count: 'exact' }).select(columns)
    : client.from('operational_audit').select(columns, { count: 'exact' });
  if (search) query = query.ilike('action', `%${search.replace(/[\\%_]/g, '\\$&')}%`);
  if (selectedCategory) query = query.or(categoryFilter(selectedCategory.pattern));
  const countEvents = () => client.from('operational_audit').select('id', { count: 'exact', head: true });
  const [{ data, count, error }, total, finance, tenancy] = await Promise.all([
    query.order('created_at', { ascending: false })
    .order('id', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1),
    countEvents(),
    countEvents().or(categoryFilter(financeCategory.pattern)),
    countEvents().or(categoryFilter(tenancyCategory.pattern)),
  ]);

  const rows = Array.isArray(data) ? data : [];

  const [{ data: roomsData }, { data: tenantsData }, { data: assignmentsData }, { data: maintenanceData }, { data: paymentsData }, { data: invoicesData }, { data: concernsData }] = rows.length
    ? await Promise.all([
        client.from('rooms').select('id,room_number'),
        client.from('tenant_profiles').select('user_id,display_name'),
        client.from('room_assignments').select('id,tenant_id,room_id'),
        client.from('maintenance_requests').select('id,room_id'),
        client.from('rent_payments').select('id,tenant_id,invoice_id'),
        client.from('rent_invoices').select('id,room_id,tenant_id'),
        client.from('concerns').select('id,tenant_id'),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const roomById = new Map((roomsData ?? []).map(r => [r.id, r.room_number]));
  const tenantNameById = new Map((tenantsData ?? []).map(t => [t.user_id, t.display_name]));
  const tenantRoomById = new Map((assignmentsData ?? []).map(a => [a.tenant_id, roomById.get(a.room_id)]));
  const assignmentRoomById = new Map((assignmentsData ?? []).map(a => [a.id, roomById.get(a.room_id)]));
  const maintenanceRoomById = new Map((maintenanceData ?? []).map(m => [m.id, roomById.get(m.room_id)]));
  const invoiceRoomById = new Map((invoicesData ?? []).map(inv => [inv.id, roomById.get(inv.room_id) ?? tenantRoomById.get(inv.tenant_id)]));
  const paymentRoomById = new Map((paymentsData ?? []).map(p => [p.id, invoiceRoomById.get(p.invoice_id) ?? tenantRoomById.get(p.tenant_id)]));
  const concernRoomById = new Map((concernsData ?? []).map(c => [c.id, tenantRoomById.get(c.tenant_id)]));

  const resolveActor = (actorId: string | null) => {
    if (!actorId) return 'System';
    return tenantNameById.get(actorId) ?? 'Owner / Caretaker';
  };

  const resolveRoom = (recordId: string, actorId: string | null) => {
    const room =
      roomById.get(recordId) ??
      assignmentRoomById.get(recordId) ??
      maintenanceRoomById.get(recordId) ??
      paymentRoomById.get(recordId) ??
      invoiceRoomById.get(recordId) ??
      concernRoomById.get(recordId) ??
      (actorId ? tenantRoomById.get(actorId) : undefined);
    return room ? `Room ${room}` : '—';
  };

  const href = (next: number) => '/management/audit?' + new URLSearchParams({ page: String(next), search, category, role });

  const cards = [
    { label: 'Total audit events', icon: 'fileSearch' as const, count: total.count },
    { label: financeCategory.label, icon: 'wallet' as const, count: finance.count },
    { label: tenancyCategory.label, icon: 'users' as const, count: tenancy.count },
  ];

  return <div className="audit-trail">
    <PageHeader title="Audit Trail" />
    <section className="audit-trail-summary" aria-label="Audit totals">
      {cards.map(card => <article key={card.label}>
        <Icon name={card.icon} />
        <h2>{card.label}</h2>
        <strong>{card.count?.toLocaleString('en-PH') ?? '—'}</strong>
      </article>)}
    </section>
    <section className="audit-trail-panel" aria-labelledby="audit-events-title">
      <header className="audit-trail-header">
        <div><h2 id="audit-events-title">Recorded activity</h2><p>Event times are shown in Manila time.</p></div>
        {!error && <span>{count ?? 0} matching events</span>}
      </header>
      <AuditFilters key={JSON.stringify([search, category, role])} search={search} category={category} role={role}
        categories={[...categories, ...(category === 'tenancy' ? [['tenancy', tenancyCategory] as const] : [])].map(([value, item]) => ({ value, label: item.label }))} />
      {error ? <p role="alert">Audit history could not be loaded. <Link href={href(page)}>Retry</Link></p>
        : !rows.length ? <p>No audit events on this page.</p>
        : <div className="operational-table-wrap audit-trail-table" tabIndex={0} role="region" aria-label="Audit events">
          <table className="operational-table">
            <thead><tr><th scope="col">Date and time</th><th scope="col">Actor</th><th scope="col">Action</th><th scope="col">Room</th><th scope="col">Details</th></tr></thead>
            <tbody>{rows.map(event => <tr key={event.id}>
              <td><time className="audit-trail-time" dateTime={event.created_at}><strong>{dateFormat.format(new Date(event.created_at))}</strong><span>{timeFormat.format(new Date(event.created_at))}</span></time></td>
              <td>{resolveActor(event.actor_id)}</td>
              <td><span className="audit-trail-action">{event.action.replace(/[._]/g, ' ')}</span></td>
              <td>{resolveRoom(event.record_id, event.actor_id)}</td>
              <td>{event.reason || '—'}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      {!error && (count ?? 0) > 0 && (() => {
        const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
        const hasPrev = page > 1;
        const hasNext = page < 10000 && page < totalPages;
        const prevIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>;
        const nextIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>;
        return <nav className="audit-pagination" aria-label="Audit pages">
          {hasPrev
            ? <Link className="audit-pagination-btn" href={href(page - 1)} aria-label="Previous page">{prevIcon}</Link>
            : <span className="audit-pagination-btn is-disabled" aria-disabled="true">{prevIcon}</span>}
          <span className="audit-pagination-label">Page</span>
          <span className="audit-pagination-current">{page}</span>
          <span className="audit-pagination-label">of {totalPages}</span>
          {hasNext
            ? <Link className="audit-pagination-btn" href={href(page + 1)} aria-label="Next page">{nextIcon}</Link>
            : <span className="audit-pagination-btn is-disabled" aria-disabled="true">{nextIcon}</span>}
        </nav>;
      })()}
    </section>
  </div>;
}
