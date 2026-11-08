import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';
import { verifyAuthSession } from '@/app/lib/backend/identity';
import { BackendError, publicBackendError } from '@/app/lib/backend/security';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const client = await createSupabaseServerClient();
    const session = await verifyAuthSession(client.auth);
    const { error: accessError } = await client.rpc('mapsilip_dashboard');
    if (accessError) throw new BackendError(accessError.code === '42501' ? 'forbidden' : 'unavailable');
    const { data: tenant, error: tenantError } = await client.from('tenant_profiles')
      .select('display_name,phone,emergency_contact').eq('user_id', session.identity.userId).maybeSingle();
    if (tenantError) throw tenantError;
    if (tenant) return NextResponse.json({ ...tenant, email: session.email }, { headers: { 'Cache-Control': 'no-store' } });
    const { data: staff, error: staffError } = await client.from('staff_profiles')
      .select('display_name,phone').eq('user_id', session.identity.userId).maybeSingle();
    if (staffError) throw staffError;
    return NextResponse.json({ display_name: staff?.display_name ?? '', phone: staff?.phone ?? '', email: session.email },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const safe = publicBackendError(error);
    return NextResponse.json({ error: safe.code }, { status: safe.status });
  }
}
