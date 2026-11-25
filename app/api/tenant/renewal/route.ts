import { NextResponse, type NextRequest } from 'next/server';
import { getTenantAccess } from '@/app/lib/backend/tenant';
import { assertRequestOrigin } from '@/app/lib/backend/auth/dependencies';
import { BackendError, publicBackendError } from '@/app/lib/backend/security';

async function renewal(submit: boolean, request?: NextRequest) {
  try {
    if (request) assertRequestOrigin(request);
    const { client } = await getTenantAccess();
    const { data, error } = await client.rpc('mapsilip_tenant_contract_renewal', { p_submit: submit });
    if (!submit && error?.code === 'PGRST202') return NextResponse.json(null, { headers: { 'Cache-Control': 'no-store' } });
    if (error) throw new BackendError(error.code === '42501' ? 'forbidden' : error.code === '22023' ? 'invalid_input' : 'unavailable');
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const safe = publicBackendError(error);
    return NextResponse.json({ error: safe.code }, { status: safe.status });
  }
}

export function GET() { return renewal(false); }
export function POST(request: NextRequest) { return renewal(true, request); }
