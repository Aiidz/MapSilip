import { revokePushForCurrentDevice } from '@/app/lib/backend/push/logout';
import { NextResponse, type NextRequest } from 'next/server';
import { assertRequestOrigin } from '@/app/lib/backend/auth/dependencies';
import { assertTenantAuthEnabled } from '@/app/lib/backend/tenant-activation';
import { BackendError } from '@/app/lib/backend/security';
import { noStoreHeaders, safeAuthError } from '@/app/lib/backend/auth/http';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    assertTenantAuthEnabled();
    assertRequestOrigin(request);
    await revokePushForCurrentDevice();
    const client = await createSupabaseServerClient('read-write');
    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError || !user?.id) throw new BackendError('unauthenticated');
    const { error } = await client.auth.signOut({ scope: 'global' });
    if (error) throw new BackendError('unavailable');
    return NextResponse.json({ state: 'signed-out' }, { headers: noStoreHeaders() });
  } catch (error) {
    return safeAuthError(error);
  }
}
