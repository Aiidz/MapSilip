import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { assertRequestOrigin, getTrustedClientAddress } from '@/app/lib/backend/auth/dependencies';
import { consumeAccountRequestRateLimit } from '@/app/lib/backend/auth/rate-limit';
import { getSecurityExecutor } from '@/app/lib/backend/auth/executor';
import { getSupabaseEnvironment } from '@/app/lib/supabase/env';
import { BackendError, publicBackendError } from '@/app/lib/backend/security';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let stage = 'request_origin';
  try {
    assertRequestOrigin(request);
    stage = 'input_validation';
    if (Number(request.headers.get('content-length')) > 4096) throw new BackendError('invalid_input');
    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const confirmPassword = typeof body.confirm_password === 'string' ? body.confirm_password : '';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320 ||
        name.length < 1 || name.length > 80 || (phone && (phone.length < 6 || phone.length > 30))) {
      throw new BackendError('invalid_input');
    }

    if (!password || password.length < 8 || password.length > 128 ||
        !confirmPassword || password !== confirmPassword) throw new BackendError('invalid_input');

    stage = 'server_configuration';
    const secret = process.env.MAPSILIP_RATE_LIMIT_HASH_KEY;
    if (!secret) throw new BackendError('unavailable');
    stage = 'database_connection';
    const executor = await getSecurityExecutor();
    stage = 'rate_limit';
    if (!await consumeAccountRequestRateLimit(executor, secret, email, getTrustedClientAddress(request))) {
      throw new BackendError('rate_limited');
    }
    stage = 'database_preflight';
    if (!await executor.accountRequestProvisioningReady()) throw new BackendError('unavailable');

    stage = 'auth_configuration';
    const { url, publishableKey } = getSupabaseEnvironment();
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey || serviceKey === publishableKey || serviceKey.startsWith('sb_publishable_')) {
      throw new BackendError('unavailable');
    }
    // Auth Admin creates a confirmed identity without sending a signup confirmation email.
    // The database grants no tenant access until an owner approves the request with a room.
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    stage = 'auth_identity_creation';
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { display_name: name, phone: phone || null },
    });
    let userId = created.user?.id;
    if (createError) {
      if (createError.status !== 422) throw new BackendError('unavailable');
      // A previous request may have created the identity before its database insert failed.
      // Reuse it only when the applicant proves knowledge of that same password.
      const verifier = createClient(url, publishableKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      });
      const { data: existing, error: signInError } = await verifier.auth.signInWithPassword({ email, password });
      if (signInError || existing.user?.email?.toLowerCase() !== email) throw new BackendError('invalid_input');
      userId = existing.user.id;
      await verifier.auth.signOut({ scope: 'local' });
    }
    if (!userId) throw new BackendError('unavailable');

    stage = 'request_persistence';
    await executor.submitAccountRequest(email, name, phone || null, userId);

    return NextResponse.json(
      {
        state: 'received',
        message: 'Your account request has been submitted. Dormitory management will review your request and assign your room before you can log in.',
      },
      { status: 202, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const safe = publicBackendError(error);
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[account-request]', { stage, category: safe.code });
    }
    if (stage === 'request_persistence' && safe.code === 'invalid_input') {
      return NextResponse.json({ error: 'account_unavailable', message: 'An account or request already exists for these credentials. Try logging in, or contact dormitory management for help.' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ error: safe.code, message: safe.message }, { status: safe.status });
  }
}
