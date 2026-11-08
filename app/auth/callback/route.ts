import { captureRecoveryGrant, recoveryGrantCookie, recoveryGrantOptions } from '@/app/lib/backend/auth/recovery-grant';
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';
import { getTrustedAppOrigin } from '@/app/lib/backend/auth/dependencies';
import { safeReturnPath } from '@/app/lib/backend/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type');
  const destination = safeReturnPath(request.nextUrl.searchParams.get('next'),
    ['/reset-password', '/login', '/activate'], '/login');
  if (destination === '/reset-password') {
    const grant = captureRecoveryGrant(request.nextUrl.searchParams);
    const response = NextResponse.redirect(new URL(grant ? '/reset-password' : '/login?error=auth_link', getTrustedAppOrigin()),
      { headers: { 'Cache-Control': 'private, no-store' } });
    if (grant) response.cookies.set(recoveryGrantCookie, grant, recoveryGrantOptions());
    return response;
  }
  const client = await createSupabaseServerClient('read-write');
  let confirmed = false;
  if (code) {
    confirmed = !(await client.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && ['recovery', 'signup', 'email', 'invite'].includes(type ?? '')) {
    confirmed = !(await client.auth.verifyOtp({ token_hash: tokenHash, type: type as 'recovery' | 'signup' | 'email' | 'invite' })).error;
  }
  const requestId = request.nextUrl.searchParams.get('request_id');
  const invitation = request.nextUrl.searchParams.get('invitation');
  const activationQuery = destination === '/activate' && requestId && invitation &&
    /^[0-9a-f-]{36}$/i.test(requestId) && /^[0-9a-f]{64}$/.test(invitation)
    ? `?id=${encodeURIComponent(requestId)}&token=${encodeURIComponent(invitation)}` : '';
  const path = confirmed && (destination !== '/activate' || activationQuery)
    ? destination + activationQuery : '/login?error=auth_link';
  return NextResponse.redirect(new URL(path, getTrustedAppOrigin()), { headers: { 'Cache-Control': 'private, no-store' } });
}
