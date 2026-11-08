import { NextResponse, type NextRequest } from 'next/server';
import { assertRequestOrigin } from '@/app/lib/backend/auth/dependencies';
import { verifyAuthSession } from '@/app/lib/backend/identity';
import { BackendError, publicBackendError } from '@/app/lib/backend/security';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sendError(error: unknown) {
  const safe = publicBackendError(error);
  return NextResponse.json({ error: safe.code, message: safe.message },
    { status: safe.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: NextRequest) {
  try {
    const page = Number(request.nextUrl.searchParams.get('page') ?? 1);
    const pageSize = Number(request.nextUrl.searchParams.get('pageSize') ?? 25);
    const search = (request.nextUrl.searchParams.get('search') ?? '').trim();
    const status = request.nextUrl.searchParams.get('status') ?? 'active';
    if (!Number.isInteger(page) || page < 1 || page > 10000 ||
      !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 ||
      search.length > 80 || /[%_\\]/.test(search) || !['', 'active', 'inactive'].includes(status)) {
      throw new BackendError('invalid_input');
    }
    const client = await createSupabaseServerClient();
    await verifyAuthSession(client.auth);
    const { data, error } = await client.rpc('mapsilip_tenant_directory', {
      p_page: page, p_page_size: pageSize, p_search: search, p_status: status,
    });
    if (error) {
      if (error.code === '42501') throw new BackendError('forbidden');
      if (error.code?.startsWith('22')) throw new BackendError('invalid_input');
      throw new BackendError('unavailable');
    }
    if (!data || !Array.isArray(data.rows) || !Number.isInteger(data.count)) throw new BackendError('unavailable');
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return sendError(error); }
}

export async function POST(request: NextRequest) {
  try {
    assertRequestOrigin(request);
    if (Number(request.headers.get('content-length')) > 500) throw new BackendError('invalid_input');
    const raw = await request.text();
    if (raw.length > 500) throw new BackendError('invalid_input');
    let body: { action?: unknown; id?: unknown };
    try { body = JSON.parse(raw); } catch { throw new BackendError('invalid_input'); }
    if (body?.action !== 'deactivate' || typeof body.id !== 'string' || !uuidPattern.test(body.id)) {
      throw new BackendError('invalid_input');
    }
    const client = await createSupabaseServerClient();
    await verifyAuthSession(client.auth);
    const { data, error } = await client.rpc('mapsilip_deactivate_tenant', { p_tenant_id: body.id });
    if (error) {
      if (error.code === '42501') throw new BackendError('forbidden');
      if (error.code === 'P0002') throw new BackendError('invalid_input');
      throw new BackendError('unavailable');
    }
    if (data?.state !== 'deactivated') throw new BackendError('unavailable');
    return NextResponse.json({ state: 'deactivated' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return sendError(error); }
}
