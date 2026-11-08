import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { assertRequestOrigin, getTrustedAppOrigin } from '@/app/lib/backend/auth/dependencies';
import { getSecurityExecutor } from '@/app/lib/backend/auth/executor';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';
import { BackendError, publicBackendError } from '@/app/lib/backend/security';

export const runtime = 'nodejs';
const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validToken = /^[0-9a-f]{64}$/;
function hash(value: string) { return createHash('sha256').update(value).digest('hex'); }

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id') ?? '';
    const token = request.nextUrl.searchParams.get('token') ?? '';
    if (!validId.test(id) || !validToken.test(token)) throw new BackendError('invalid_input');
    const details = await (await getSecurityExecutor()).invitationDetails(id, hash(token));
    if (!details) throw new BackendError('forbidden');
    return NextResponse.json(details, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch (error) {
    const safe = publicBackendError(error);
    return NextResponse.json({ error: safe.code }, { status: safe.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    assertRequestOrigin(request);
    if (Number(request.headers.get('content-length')) > 2048) throw new BackendError('invalid_input');
    const body = await request.json();
    const { id, token, password } = body;
    if (typeof id !== 'string' || !validId.test(id) || typeof token !== 'string' || !validToken.test(token) ||
        typeof password !== 'string' || password.length < 8 || password.length > 128) throw new BackendError('invalid_input');
    const details = await (await getSecurityExecutor()).invitationDetails(id, hash(token));
    if (!details) throw new BackendError('forbidden');
    // The SSR client stores the PKCE verifier in the request's auth cookie for the email callback.
    const client = await createSupabaseServerClient('read-write');
    const callback = new URL('/auth/callback', getTrustedAppOrigin());
    callback.searchParams.set('next', '/activate');
    callback.searchParams.set('request_id', id);
    callback.searchParams.set('invitation', token);
    const { error } = await client.auth.signUp({ email: details.email, password,
      options: { emailRedirectTo: callback.toString() } });
    if (error) throw new BackendError('invalid_input');
    return NextResponse.json({ state: 'confirmation_required', message: 'Check your email to confirm the account, then return to MapSilip.' },
      { status: 202, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const safe = publicBackendError(error);
    return NextResponse.json({ error: safe.code, message: safe.message }, { status: safe.status });
  }
}
