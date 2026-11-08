import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { assertRequestOrigin } from '@/app/lib/backend/auth/dependencies';
import { getSecurityExecutor } from '@/app/lib/backend/auth/executor';
import { claimApprovedTenantAccount } from '@/app/lib/backend/tenant-access';
import { assertTenantAuthEnabled } from '@/app/lib/backend/tenant-activation';
import { getSupabaseEnvironment } from '@/app/lib/supabase/env';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';
import { verifyAuthSession } from '@/app/lib/backend/identity';
import { BackendError, publicBackendError } from '@/app/lib/backend/security';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    assertRequestOrigin(request);
    assertTenantAuthEnabled();
    if (Number(request.headers.get('content-length')) > 2048) throw new BackendError('invalid_input');
    const { id, token, password } = await request.json();
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id) ||
        typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token) ||
        (password !== undefined && (typeof password !== 'string' || password.length < 8 || password.length > 128))) {
      throw new BackendError('invalid_input');
    }
    const hash = createHash('sha256').update(token).digest('hex');
    if (password !== undefined) {
      const details = await (await getSecurityExecutor()).invitationDetails(id, hash);
      if (!details) throw new BackendError('forbidden');
      const { url, publishableKey } = getSupabaseEnvironment();
      const verifier = createClient(url, publishableKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      });
      const session = await claimApprovedTenantAccount(verifier.auth,
        async (requestId, invitationHash) => {
          const { data, error } = await verifier.rpc('mapsilip_claim_account', {
            p_id: requestId, p_hash: invitationHash,
          });
          return { data, error };
        }, details.email, password, id, hash);
      const cookieClient = await createSupabaseServerClient('read-write');
      const { error: persistenceError } = await cookieClient.auth.setSession(session);
      if (persistenceError) throw new BackendError('unavailable');
      const { data: { user }, error: userError } = await cookieClient.auth.getUser();
      if (userError || user?.email?.toLowerCase() !== details.email.toLowerCase()) {
        await cookieClient.auth.signOut({ scope: 'local' });
        throw new BackendError('unavailable');
      }
      return NextResponse.json({ destination: '/tenant' }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const client = await createSupabaseServerClient();
    await verifyAuthSession(client.auth);
    const { data, error } = await client.rpc('mapsilip_claim_account', {
      p_id: id, p_hash: hash,
    });
    if (error || data?.state !== 'activated') throw new BackendError('forbidden');
    return NextResponse.json({ destination: '/tenant' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const safe = publicBackendError(error);
    return NextResponse.json({ error: safe.code, message: safe.message }, { status: safe.status });
  }
}
