import { NextResponse, type NextRequest } from 'next/server';
import { assertRequestOrigin, getTrustedAppOrigin, getTrustedClientAddress } from '@/app/lib/backend/auth/dependencies';
import { recoveryEmailExists } from '@/app/lib/backend/auth/recovery';
import { getSecurityExecutor } from '@/app/lib/backend/auth/executor';
import { consumeRecoveryRateLimit } from '@/app/lib/backend/auth/rate-limit';
import { isStaffAuthEnabled } from '@/app/lib/backend/auth/activation';
import { isTenantAuthEnabled } from '@/app/lib/backend/tenant-activation';
import { BackendError } from '@/app/lib/backend/security';
import { noStoreHeaders, parseAuthMutation, safeAuthError } from '@/app/lib/backend/auth/http';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseEnvironment } from '@/app/lib/supabase/env';
import { supabaseSessionCookieOptions } from '@/app/lib/supabase/cookies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    if (!isStaffAuthEnabled() && !isTenantAuthEnabled()) throw new BackendError('unavailable');
    assertRequestOrigin(request);
    const { email } = await parseAuthMutation(request, ['email']);
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 320) throw new BackendError('invalid_input');
    const executor = await getSecurityExecutor();
    const secret = process.env.MAPSILIP_RATE_LIMIT_HASH_KEY;
    if (!secret) throw new BackendError('unavailable');
    if (!await consumeRecoveryRateLimit(executor, secret, normalizedEmail, getTrustedClientAddress(request))) throw new BackendError('rate_limited');
    if (!await recoveryEmailExists(normalizedEmail)) {
      return NextResponse.json({ error: 'account_not_found', message: 'No account is registered with this email. Please enter your account email and try again.' },
        { status: 400, headers: noStoreHeaders() });
    }
    const { url, publishableKey } = getSupabaseEnvironment();
    const response = NextResponse.json({ state: 'sent' }, { headers: noStoreHeaders() });
    // Commit the PKCE verifier only when sending succeeds. Failed resends must
    // not clear the verifier belonging to a reset email already in the inbox.
    const client = createServerClient(url, publishableKey, {
      cookieOptions: supabaseSessionCookieOptions(),
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: writes => { for (const { name, value, options } of writes) response.cookies.set(name, value, options); },
      },
    });
    const { error } = await client.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${getTrustedAppOrigin()}/auth/callback?next=/reset-password`,
    });
    if (error?.status === 429) {
      return NextResponse.json({ error: 'rate_limited', message: 'Please wait before requesting another reset email. You can still use the last link sent to you.' },
        { status: 429, headers: { ...noStoreHeaders(), 'Retry-After': '60' } });
    }
    if (error) throw new BackendError('unavailable');
    return response;
  } catch (error) {
    return safeAuthError(error);
  }
}
