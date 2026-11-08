import { NextResponse, type NextRequest } from 'next/server';
import { assertRequestOrigin } from '@/app/lib/backend/auth/dependencies';
import { isStaffAuthEnabled } from '@/app/lib/backend/auth/activation';
import { isTenantAuthEnabled } from '@/app/lib/backend/tenant-activation';
import { BackendError } from '@/app/lib/backend/security';
import { noStoreHeaders, parseAuthMutation, safeAuthError } from '@/app/lib/backend/auth/http';
import { verifyAuthSession } from '@/app/lib/backend/identity';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    if (!isStaffAuthEnabled() && !isTenantAuthEnabled()) throw new BackendError('unavailable');
    assertRequestOrigin(request);
    const { currentPassword, newPassword } = await parseAuthMutation(request, ['currentPassword', 'newPassword']);
    if (!currentPassword || currentPassword.length > 1024 || newPassword.length < 8 || newPassword.length > 1024 || currentPassword === newPassword) {
      throw new BackendError('invalid_input');
    }
    const client = await createSupabaseServerClient('read-write');
    await verifyAuthSession(client.auth);
    const { error: accessError } = await client.rpc('mapsilip_dashboard');
    if (accessError) throw new BackendError(accessError.code === '42501' ? 'forbidden' : 'unavailable');
    const { error } = await client.auth.updateUser({ password: newPassword, current_password: currentPassword });
    if (error) throw new BackendError('invalid_input');
    return NextResponse.json({ state: 'password-updated' }, { headers: noStoreHeaders() });
  } catch (error) { return safeAuthError(error); }
}
