import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';
import { verifyAuthSession } from '@/app/lib/backend/identity';
import { BackendError, publicBackendError } from '@/app/lib/backend/security';
import { tenantDashboardDetails } from '@/app/lib/tenant-dashboard.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const client = await createSupabaseServerClient();
    const { identity } = await verifyAuthSession(client.auth);
    const { data, error } = await client.rpc('mapsilip_dashboard');
    if (error?.code === '42501') throw new BackendError('forbidden');
    if (error || !data) throw new BackendError('unavailable');
    let responseData = data;
    if ('next_invoice' in data) {
      const { data: profile, error: profileError } = await client.from('tenant_profiles')
        .select('display_name').eq('user_id', identity.userId).maybeSingle();
      if (profileError) throw new BackendError('unavailable');
      const { data: nextInvoice, error: invoiceError } = await client.rpc('mapsilip_next_rent_invoice');
      if (invoiceError) throw new BackendError('unavailable');
      const { data: assignment, error: assignmentError } = await client.from('room_assignments')
        .select('contract_monthly_rent,rooms(room_number,monthly_rent)')
        .eq('tenant_id', identity.userId).is('ended_on', null).maybeSingle();
      if (assignmentError) throw new BackendError('unavailable');
      const room = assignment?.rooms as { room_number?: string; monthly_rent?: number | null } | { room_number?: string; monthly_rent?: number | null }[] | null | undefined;
      responseData = tenantDashboardDetails({ ...data, display_name: profile?.display_name ?? null, next_invoice: nextInvoice }, {
        roomNumber: Array.isArray(room) ? room[0]?.room_number : room?.room_number,
        monthlyRent: assignment?.contract_monthly_rent ?? (Array.isArray(room) ? room[0]?.monthly_rent : room?.monthly_rent),
      });
    }
    if (Array.isArray(data.income_by_currency)) {
      const { data: overview, error: overviewError } = await client.rpc('mapsilip_payment_status_summary');
      if (overviewError || !overview) throw new BackendError('unavailable');
      return NextResponse.json({ ...data, payment_overview: overview }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json(responseData, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const safe = publicBackendError(error);
    return NextResponse.json({ error: safe.code, message: safe.message }, { status: safe.status });
  }
}
