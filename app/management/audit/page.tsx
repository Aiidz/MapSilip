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

  const [{ data: roomsData }, { data: tenantsData }, { data: assignmentsData }] = rows.length
    ? await Promise.all([
        client.from('rooms').select('id,room_number'),
        client.from('tenant_profiles').select('user_id,display_name'),
        client.from('room_assignments').select('tenant_id,room_id').eq('status', 'active'),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const roomById = new Map((roomsData ?? []).map(r => [r.id, r.room_number]));
  const tenantNameById = new Map((tenantsData ?? []).map(t => [t.user_id, t.display_name]));
  const tenantRoomById = new Map((assignmentsData ?? []).map(a => [a.tenant_id, roomById.get(a.room_id)]));

  const resolveActor = (actorId: string | null) => {
    if (!actorId) return 'System';
    return tenantNameById.get(actorId) ?? 'Owner / Caretaker';
  };

  const resolveRoom = (recordId: string, actorId: string | null) => {
    const directRoom = roomById.get(recordId);
    if (directRoom) return `Room ${directRoom}`;
    if (actorId) {
      const actorRoom = tenantRoomById.get(actorId);
      if (actorRoom) return `Room ${actorRoom}`;
    }
    return '—';
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
      {!error && (page > 1 || (count ?? 0) > pageSize) && <nav className="operational-pagination" aria-label="Audit pages">
        {page > 1 && <Link href={href(page - 1)}>Previous</Link>}
        <span>Page {page}</span>
        {page < 10000 && page * pageSize < (count ?? 0) && <Link href={href(page + 1)}>Next</Link>}
      </nav>}
    </section>
  </div>;
}
