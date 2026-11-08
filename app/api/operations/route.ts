import { NextResponse, type NextRequest } from 'next/server';
import { assertRequestOrigin } from '@/app/lib/backend/auth/dependencies';
import { verifyAuthSession } from '@/app/lib/backend/identity';
import { BackendError, publicBackendError } from '@/app/lib/backend/security';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ResourceSpec = { table: string; columns: string; order: string; search: string; statuses: readonly string[] };
const resources: Record<string, ResourceSpec> = {
  rooms: { table: 'rooms', columns: 'id,room_number,floor_label,capacity,availability,created_at', order: 'room_number', search: 'room_number', statuses: ['available','reserved','maintenance'] },
  assignments: { table: 'room_assignments', columns: 'id,tenant_id,room_id,started_on,ended_on,created_at', order: 'created_at', search: '', statuses: [] },
  tenants: { table: 'tenant_profiles', columns: 'user_id,display_name,phone,emergency_contact,status,created_at', order: 'created_at', search: 'display_name', statuses: ['active','inactive'] },
  accountRequests: { table: 'account_requests', columns: 'id,email,display_name,phone,status,created_at,reviewed_at', order: 'created_at', search: 'email', statuses: ['pending','approved','rejected','activated'] },
  invoices: { table: 'invoices', columns: 'id,tenant_id,room_id,coverage_start,coverage_end,due_on,amount,currency,note,created_at', order: 'created_at', search: '', statuses: [] },
  payments: { table: 'payments', columns: 'id,invoice_id,tenant_id,amount,method,reference_number,attachment_id,status,review_note,created_at,reviewed_at', order: 'created_at', search: 'reference_number', statuses: ['pending','approved','rejected'] },
  maintenance: { table: 'maintenance_requests', columns: 'id,tenant_id,room_id,category,description,attachment_id,status,staff_response,created_at,updated_at', order: 'created_at', search: 'description', statuses: ['pending','in_progress','resolved'] },
  concerns: { table: 'concerns', columns: 'id,tenant_id,category,description,status,owner_response,created_at,updated_at', order: 'created_at', search: 'description', statuses: ['pending','resolved'] },
  visits: { table: 'planned_visits', columns: 'id,tenant_id,visitor_name,visit_on,arrival_time,departure_time,purpose,cancelled_at,created_at', order: 'visit_on', search: 'visitor_name', statuses: [] },
  notifications: { table: 'notifications', columns: 'id,title,body,href,event_key,read_at,created_at', order: 'created_at', search: 'title', statuses: [] },
};
type Resource = keyof typeof resources;
const tenantIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    const category = request.nextUrl.searchParams.get('category') ?? '';
    const prefixes: Record<string,string> = { payments:'payment:',maintenance:'maintenance:',concerns:'concern:',accounts:'account-request:',visits:'visit:' };
    if (category && (kind !== 'notifications' || !prefixes[category])) throw new BackendError('invalid_input');
    const read = request.nextUrl.searchParams.get('read') ?? '';
    if (read && (kind !== 'notifications' || !['unread','read'].includes(read))) throw new BackendError('invalid_input');
    const client = await createSupabaseServerClient();
    await verifyAuthSession(client.auth);
    let query = client.from(spec.table).select(spec.columns, { count: 'exact' });
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
    else if (category) query = query.like('event_key', `${prefixes[category]}%`);
    if (read === 'unread') query = query.is('read_at',null);
    if (read === 'read') query = query.not('read_at','is',null);
    if (month) {
      const start = `${month}-01T00:00:00.000Z`;
      const [year, index] = month.split('-').map(Number);
      const end = new Date(Date.UTC(year,index,1)).toISOString();
      query = query.gte('created_at',start).lt('created_at',end);
    }
    const { data, count, error } = await query.order(spec.order, { ascending: kind === 'rooms' })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (error) throw new BackendError('unavailable');
    return NextResponse.json({ rows: data ?? [], count: count ?? 0, page }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const safe = publicBackendError(error);
    return NextResponse.json({ error: safe.code, message: safe.message }, { status: safe.status });
  }
}

const allowedActions = new Set([
  'notification.read','profile.update','attachment.begin','room.create','room.update','room.assign',
  'invoice.create','payment.submit','payment.review','maintenance.create','maintenance.update',
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
    const { data, error } = body.action === 'visit.create'
      ? await client.rpc('mapsilip_create_visit', { p_data: body.data })
      : body.action === 'concern.create'
        ? await client.rpc('mapsilip_create_concern', { p_data: body.data })
        : await client.rpc('mapsilip_operate', { p_action: body.action, p_data: body.data });
    if (error) {
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
