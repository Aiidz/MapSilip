import { redeemRecoveryGrant, recoveryGrantCookie, recoveryGrantOptions } from '@/app/lib/backend/auth/recovery-grant';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { assertRequestOrigin, createStaffAuthDependencies } from '@/app/lib/backend/auth/dependencies';
import { isStaffAuthEnabled } from '@/app/lib/backend/auth/activation';
import { isTenantAuthEnabled } from '@/app/lib/backend/tenant-activation';
import { BackendError } from '@/app/lib/backend/security';
import { noStoreHeaders, parseAuthMutation, safeAuthError } from '@/app/lib/backend/auth/http';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';
import { verifyAuthSession } from '@/app/lib/backend/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    if (!isStaffAuthEnabled() && !isTenantAuthEnabled()) throw new BackendError('unavailable');
    assertRequestOrigin(request);
    const { password } = await parseAuthMutation(request, ['password']);
    if (password.length < 8 || password.length > 1024) throw new BackendError('invalid_input');
    const cookieStore = await cookies();
    const grant = cookieStore.get(recoveryGrantCookie)?.value;
    if (!grant) throw new BackendError('forbidden');
    cookieStore.set(recoveryGrantCookie, '', { ...recoveryGrantOptions(), maxAge: 0 });
    const client = await createSupabaseServerClient('read-write');
    await redeemRecoveryGrant(client.auth, grant);
    const session = await verifyAuthSession(client.auth);
    if (!session.email) throw new BackendError('forbidden');
    let authorizedStaff = false;
    if (isStaffAuthEnabled()) {
      const cookieStore = await cookies();
      const dependencies = await createStaffAuthDependencies(cookieStore.getAll().map(({ name, value }) => ({ name, value })));
      const mapped = await dependencies.beginStaffSignin(session.email.toLowerCase());
      authorizedStaff = !!mapped && mapped.account.userId === session.identity.userId && mapped.account.status === 'active';
    }
    let authorizedTenant = false;
    if (!authorizedStaff && isTenantAuthEnabled()) {
      const { data, error } = await client.from('tenant_profiles').select('user_id')
        .eq('user_id', session.identity.userId).maybeSingle();
      if (error) throw new BackendError('unavailable');
      authorizedTenant = data?.user_id === session.identity.userId;
    }
    if (!authorizedStaff && !authorizedTenant) throw new BackendError('forbidden');
    const { error } = await client.auth.updateUser({ password });
    if (error) throw new BackendError('invalid_input');
    const { error: signOutError } = await client.auth.signOut({ scope: 'global' });
    if (signOutError) throw new BackendError('unavailable');
    return NextResponse.json({ state: 'password-updated' }, { headers: noStoreHeaders() });
  } catch (error) {
    return safeAuthError(error);
  }
}
