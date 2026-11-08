import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';
import { verifyAuthSession } from '@/app/lib/backend/identity';
import { BackendError, publicBackendError } from '@/app/lib/backend/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const client = await createSupabaseServerClient();
    await verifyAuthSession(client.auth);
    const { data, error } = await client.rpc('mapsilip_dashboard');
    if (error?.code === '42501') throw new BackendError('forbidden');
    if (error || !data) throw new BackendError('unavailable');
    if (Array.isArray(data.income_by_currency)) {
      const { data: overview, error: overviewError } = await client.rpc('mapsilip_payment_status_summary');
      if (overviewError || !overview) throw new BackendError('unavailable');
      return NextResponse.json({ ...data, payment_overview: overview }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const safe = publicBackendError(error);
    return NextResponse.json({ error: safe.code, message: safe.message }, { status: safe.status });
  }
}
