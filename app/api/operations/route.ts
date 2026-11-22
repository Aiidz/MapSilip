import { recordAttachmentLinkFailure } from '@/app/lib/storage/link-failure';
import { NextResponse, type NextRequest } from 'next/server';
import { assertRequestOrigin } from '@/app/lib/backend/auth/dependencies';
import { verifyAuthSession } from '@/app/lib/backend/identity';
import { BackendError, publicBackendError } from '@/app/lib/backend/security';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ResourceSpec = { table: string; columns: string; order: string; search: string; statuses: readonly string[] };
const resources: Record<string, ResourceSpec> = {
  rooms: { table: 'rooms', columns: 'id,room_number,floor_label,capacity,availability,monthly_rent,gender_policy,created_at', order: 'room_number', search: 'room_number', statuses: ['available','reserved','maintenance'] },
  assignments: { table: 'room_assignments', columns: 'id,tenant_id,room_id,started_on,ended_on,contract_attachment_id,contract_end_on,contract_monthly_rent,created_at', order: 'created_at', search: '', statuses: [] },
  tenants: { table: 'tenant_profiles', columns: 'gender,user_id,display_name,phone,emergency_contact,status,created_at', order: 'created_at', search: 'display_name', statuses: ['active','inactive'] },
  accountRequests: { table: 'account_requests', columns: 'id,email,display_name,phone,gender,preferred_room_id,status,created_at,reviewed_at', order: 'created_at', search: 'email', statuses: ['pending','approved','rejected','activated'] },
  invoices: { table: 'invoices', columns: 'id,tenant_id,room_id,coverage_start,coverage_end,due_on,amount,currency,note,created_at', order: 'created_at', search: '', statuses: [] },
  payments: { table: 'payments', columns: 'id,invoice_id,tenant_id,amount,method,cash_recipient,reference_number,attachment_id,status,review_note,created_at,reviewed_at', order: 'created_at', search: 'reference_number', statuses: ['pending','approved','rejected'] },
  maintenance: { table: 'maintenance_requests', columns: 'id,tenant_id,room_id,category,description,attachment_id,status,staff_response,created_at,updated_at', order: 'created_at', search: 'description', statuses: ['pending','in_progress','resolved'] },
  concerns: { table: 'concerns', columns: 'id,tenant_id,category,description,status,owner_response,created_at,updated_at', order: 'created_at', search: 'description', statuses: ['pending','resolved'] },
  visits: { table: 'planned_visits', columns: 'id,tenant_id,visitor_name,visit_on,arrival_time,departure_time,purpose,cancelled_at,created_at', order: 'visit_on', search: 'visitor_name', statuses: [] },
  notifications: { table: 'notifications', columns: 'id,title,body,href,event_key,read_at,created_at', order: 'created_at', search: 'title', statuses: [] },
};
type Resource = keyof typeof resources;
const tenantIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function addNotificationActors(client: Awaited<ReturnType<typeof createSupabaseServerClient>>, rows: Record<string, unknown>[]) {
  const activityTables = {
    payment: 'payments', maintenance: 'maintenance_requests', concern: 'concerns', visit: 'planned_visits',
  } as const;
  const idsByTable = new Map<keyof typeof activityTables, Set<string>>();
  const idByEvent = new Map<string, { table: keyof typeof activityTables; id: string }>();
  const requestIds = new Set<string>();
  for (const row of rows) {
    const event = typeof row.event_key === 'string' ? row.event_key : '';
    const activity = event.match(/^(payment|maintenance|concern|visit):([0-9a-f-]{36}):(submitted|planned):/i);
    if (activity && tenantIdPattern.test(activity[2])) {
      const table = activity[1] as keyof typeof activityTables;
      const ids = idsByTable.get(table) ?? new Set<string>(); ids.add(activity[2]); idsByTable.set(table, ids);
      idByEvent.set(event, { table, id: activity[2] });
      continue;
    }
    const request = event.match(/^account-request:([0-9a-f-]{36}):created:/i);
    if (request && tenantIdPattern.test(request[1])) requestIds.add(request[1]);
  }

  const activityResults = await Promise.all([...idsByTable].map(async ([table, ids]) => {
    const { data } = await client.from(activityTables[table]).select('id,tenant_id').in('id', [...ids]);
    return [table, data ?? []] as const;
  }));
  const tenantByActivity = new Map<string, string>();
  for (const [table, records] of activityResults) for (const record of records as { id: string; tenant_id: string }[]) {
    tenantByActivity.set(`${table}:${record.id}`, record.tenant_id);
  }

  const tenantIds = [...new Set(tenantByActivity.values())];
  const profileNames = new Map<string, string>();
  if (tenantIds.length) {
    const { data } = await client.from('tenant_profiles').select('user_id,display_name').in('user_id', tenantIds);
    for (const profile of data ?? []) profileNames.set(profile.user_id, profile.display_name);
  }

  const requestsById = new Map<string, { display_name: string; activated_user_id: string | null }>();
  if (requestIds.size) {
    const { data } = await client.from('account_requests').select('id,display_name,activated_user_id').in('id', [...requestIds]);
    for (const request of data ?? []) requestsById.set(request.id, request);
  }

  return rows.map(row => {
    const event = String(row.event_key ?? '');
    const activity = idByEvent.get(event);
    if (activity) {
      const actorId = tenantByActivity.get(`${activity.table}:${activity.id}`) ?? null;
      return { ...row, actor_id: actorId, actor_name: actorId ? profileNames.get(actorId) ?? null : null };
    }
    const requestMatch = event.match(/^account-request:([0-9a-f-]{36}):created:/i);
    const request = requestMatch ? requestsById.get(requestMatch[1]) : null;
    return request ? { ...row, actor_id: request.activated_user_id, actor_name: request.display_name } : row;
  });
}

export async function GET(request: NextRequest) {
  try {
    const kind = request.nextUrl.searchParams.get('resource') as Resource;
    const spec = resources[kind];
    if (!spec) throw new BackendError('invalid_input');
    const page = Number(request.nextUrl.searchParams.get('page') ?? '1');
    if (!Number.isInteger(page) || page < 1 || page > 10000) throw new BackendError('invalid_input');
    const pageSize = Number(request.nextUrl.searchParams.get('pageSize') ?? '25');
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new BackendError('invalid_input');
    const search = (request.nextUrl.searchParams.get('search') ?? '').trim();
    if (search.length > 80 || /[%_\\]/.test(search)) throw new BackendError('invalid_input');
    const status = request.nextUrl.searchParams.get('status') ?? '';
    if (status && !(spec.statuses as readonly string[]).includes(status)) throw new BackendError('invalid_input');
    const month = request.nextUrl.searchParams.get('month') ?? '';
    if (month && (kind !== 'payments' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))) throw new BackendError('invalid_input');
    const tenantId = request.nextUrl.searchParams.get('tenantId') ?? '';
    if (tenantId && (!['payments','concerns'].includes(kind) || !tenantIdPattern.test(tenantId))) throw new BackendError('invalid_input');
    const recordId = request.nextUrl.searchParams.get('recordId') ?? '';
    if (recordId && (!['payments','maintenance','concerns','assignments'].includes(kind) || !tenantIdPattern.test(recordId))) throw new BackendError('invalid_input');
    const category = request.nextUrl.searchParams.get('category') ?? '';
    const prefixes: Record<string,string> = { payments:'payment:',maintenance:'maintenance:',concerns:'concern:',accounts:'account-request:',visits:'visit:',contracts:'contract-expiry:' };
    if (category && (kind !== 'notifications' || !prefixes[category])) throw new BackendError('invalid_input');
    const read = request.nextUrl.searchParams.get('read') ?? '';
    if (read && (kind !== 'notifications' || !['unread','read'].includes(read))) throw new BackendError('invalid_input');
    const client = await createSupabaseServerClient();
    await verifyAuthSession(client.auth);
    const columns = kind === 'maintenance' ? `${spec.columns},satisfaction_rating,satisfaction_comment` : spec.columns;
    let query = client.from(spec.table).select(columns, { count: 'exact' });
    if (recordId) query = query.eq('id', recordId);
    if (tenantId) query = query.eq('tenant_id', tenantId);
    if (search && kind === 'payments') {
      const { data: matchingTenants, error: tenantSearchError } = await client.from('tenant_profiles')
        .select('user_id').ilike('display_name', `%${search}%`);
      if (tenantSearchError) throw new BackendError('unavailable');
      if (matchingTenants?.length) {
        const escapedSearch = search.replaceAll('"', '\\"');
        const tenantIds = matchingTenants.map(row => row.user_id).join(',');
        query = query.or(`reference_number.ilike."%${escapedSearch}%",tenant_id.in.(${tenantIds})`);
      } else query = query.ilike('reference_number', `%${search}%`);
    } else if (search && spec.search) query = query.ilike(spec.search, `%${search}%`);
    if (status) query = query.eq('status', status);
    if (category === 'payments') query = query.or('event_key.like.payment:%,event_key.like.invoice:%');
    else if (category === 'accounts') query = query.or('event_key.like.account-request:%,event_key.like.assignment:%,event_key.like.room-prep:%');
    else if (category) query = query.like('event_key', `${prefixes[category]}%`);
    if (read === 'unread') query = query.is('read_at',null);
    if (read === 'read') query = query.not('read_at','is',null);
    if (month) {
      const start = `${month}-01T00:00:00.000Z`;
      const [year, index] = month.split('-').map(Number);
      const end = new Date(Date.UTC(year,index,1)).toISOString();
      query = query.gte('created_at',start).lt('created_at',end);
    }
    query = query.order(spec.order, { ascending: kind === 'rooms' });
    if (kind === 'payments') query = query.order('id');
    const paginated = query.range((page - 1) * pageSize, page * pageSize - 1);
    let result = await paginated;
    if (kind === 'maintenance' && result.error?.code === '42703' && /satisfaction_(rating|comment)/.test(result.error.message)) {
      result = await paginated.select(spec.columns);
    }
    const { data, count, error } = result;
    if (error) throw new BackendError('unavailable');
    let rows: unknown[] = (data ?? []) as unknown as Record<string, unknown>[];
    if (kind === 'notifications' && rows.length) {
      try { rows = await addNotificationActors(client, rows as Record<string, unknown>[]); }
      catch { /* Optional actor details must not block the notification feed. */ }
    }
    return NextResponse.json({ rows, count: count ?? 0, page }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const safe = publicBackendError(error);
    return NextResponse.json({ error: safe.code, message: safe.message }, { status: safe.status });
  }
}

const allowedActions = new Set([
  'notification.read','notification.unread','profile.update','attachment.begin','room.create','room.update','room.assign',
  'invoice.create','payment.submit','payment.review','maintenance.create','maintenance.update','maintenance.rate',
  'concern.create','concern.respond','visit.create','visit.cancel',
]);

export async function POST(request: NextRequest) {
  try {
    assertRequestOrigin(request);
    if (Number(request.headers.get('content-length')) > 8000) throw new BackendError('invalid_input');
    const body = await request.json();
    if (typeof body?.action !== 'string' || !allowedActions.has(body.action) ||
        !body.data || typeof body.data !== 'object' || Array.isArray(body.data)) throw new BackendError('invalid_input');
    const client = await createSupabaseServerClient();
    await verifyAuthSession(client.auth);
    const { data, error } = body.action === 'notification.unread'
      ? await client.rpc('mapsilip_mark_notification_unread', { p_id: body.data.id })
      : body.action === 'maintenance.rate'
      ? await client.rpc('mapsilip_rate_maintenance', { p_id: body.data.id, p_rating: body.data.rating, p_comment: body.data.comment })
      : body.action === 'visit.create'
      ? await client.rpc('mapsilip_create_visit', { p_data: body.data })
      : body.action === 'concern.create'
        ? await client.rpc('mapsilip_create_concern', { p_data: body.data })
        : await client.rpc('mapsilip_operate', { p_action: body.action, p_data: body.data });
    if (error) {
      await recordAttachmentLinkFailure(client, body.data?.attachment_id);
      if (error.code === '42501') throw new BackendError('forbidden');
      if (error.code === 'P0002' || error.code?.startsWith('22') || error.code?.startsWith('23')) {
        throw new BackendError('invalid_input');
      }
      throw new BackendError('unavailable');
    }
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const safe = publicBackendError(error);
    return NextResponse.json({ error: safe.code, message: safe.message }, { status: safe.status });
  }
}
