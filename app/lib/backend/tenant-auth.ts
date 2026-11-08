import { createClient } from '@supabase/supabase-js';
import { BackendError } from './security';
import { createSupabaseServerClient } from '../supabase/server';
import { getSupabaseEnvironment } from '../supabase/env';
import { getSecurityExecutor } from './auth/executor';

/** Tenant authority comes from the RLS-filtered active profile for the verified Auth subject. */
export async function tenantSignIn(email: string, password: string) {
  const { url, publishableKey } = getSupabaseEnvironment();
  const verifier = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: signedIn, error: signInError } = await verifier.auth.signInWithPassword({ email, password });
  if (signInError || !signedIn.session) throw new BackendError('unauthenticated', 'supabase_auth');

  const { data: { user }, error: userError } = await verifier.auth.getUser();
  if (userError || !user?.id) {
    await verifier.auth.signOut({ scope: 'local' });
    throw new BackendError('unauthenticated', 'tenant_identity');
  }

  // 1. Enforce admin approval: check active tenant profile
  const { data: profile, error: profileError } = await verifier.from('tenant_profiles')
    .select('user_id, status').eq('user_id', user.id).maybeSingle();
  if (profileError) {
    await verifier.auth.signOut({ scope: 'local' });
    throw new BackendError('unavailable', 'tenant_profile');
  }
  if (!profile || profile.user_id !== user.id || profile.status !== 'active') {
    let applicantStatus: string | null = null;
    let rejectionReason: string | null = null;

    try {
      const executor = await getSecurityExecutor();
      const applicant = await executor.applicantStatus(user.id);
      if (applicant) {
        applicantStatus = applicant.status;
        rejectionReason = applicant.rejectionReason;
      }
    } catch {
      try {
        const { data: req } = await verifier.from('account_requests')
          .select('status, rejection_reason')
          .eq('activated_user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (req) {
          applicantStatus = req.status;
          rejectionReason = req.rejection_reason;
        }
      } catch {
        // Ignore fallback failure
      }
    }

    await verifier.auth.signOut({ scope: 'local' });

    if (applicantStatus === 'rejected') {
      throw new BackendError(
        'forbidden',
        'account_rejected',
        rejectionReason ? `Your account request was not approved: ${rejectionReason}` : 'Your account request was not approved.',
      );
    }
    if (applicantStatus === 'pending') {
      throw new BackendError(
        'forbidden',
        'account_pending',
        'Your account request is awaiting administrator approval.',
      );
    }

    throw new BackendError('forbidden', 'tenant_profile');
  }

  const client = await createSupabaseServerClient('read-write');
  const { error: persistenceError } = await client.auth.setSession({
    access_token: signedIn.session.access_token, refresh_token: signedIn.session.refresh_token,
  });
  if (persistenceError) throw new BackendError('unavailable', 'session_persistence');
  const { data: { user: persistedUser }, error: persistedIdentityError } = await client.auth.getUser();
  if (persistedIdentityError || persistedUser?.id !== user.id) {
    await client.auth.signOut({ scope: 'local' });
    throw new BackendError('unavailable', 'session_persistence');
  }
  return Object.freeze({ state: 'signed-in' as const, destination: '/tenant' as const });
}
