import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { assertRequestOrigin, getTrustedClientAddress } from '@/app/lib/backend/auth/dependencies';
import { consumeStatusCheckRateLimit } from '@/app/lib/backend/auth/rate-limit';
import { getSecurityExecutor } from '@/app/lib/backend/auth/executor';
import { getSupabaseEnvironment } from '@/app/lib/supabase/env';
import { BackendError, publicBackendError } from '@/app/lib/backend/security';
import { parseAuthMutation, noStoreHeaders } from '@/app/lib/backend/auth/http';

export const runtime = 'nodejs';

/**
 * Limited, authenticated status view for pending and rejected applicants.
 * Validates the applicant's credentials against Supabase Auth, retrieves their
 * own account request status, rejection reason (if any), and notifications,
 * without creating or persisting a tenant session cookie or granting portal access.
 */
export async function POST(request: NextRequest) {
  try {
    assertRequestOrigin(request);
    const input = await parseAuthMutation(request, ['email', 'password']);
    const email = input.email.trim().toLowerCase();
    const password = input.password;

    const secret = process.env.MAPSILIP_RATE_LIMIT_HASH_KEY;
    if (!secret) throw new BackendError('unavailable');
    const executor = await getSecurityExecutor();
    if (!await consumeStatusCheckRateLimit(executor, secret, email, getTrustedClientAddress(request))) {
      throw new BackendError('rate_limited');
    }

    const { url, publishableKey } = getSupabaseEnvironment();
    const verifier = createClient(url, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });

    const { data: signInData, error: signInError } = await verifier.auth.signInWithPassword({ email, password });
    if (signInError || !signInData.user?.id) {
      throw new BackendError('unauthenticated');
    }

    const userId = signInData.user.id;

    let requestData: {
      status: string;
      display_name: string | null;
      email: string;
      rejection_reason: string | null;
      created_at: string | null;
      reviewed_at: string | null;
    } | null = null;

    // 1. Fetch own account request via RLS-authenticated query
    try {
      const { data: reqRow } = await verifier
        .from('account_requests')
        .select('id, status, display_name, email, rejection_reason, created_at, reviewed_at')
        .eq('activated_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (reqRow) {
        requestData = reqRow;
      }
    } catch {
      // Fall back to executor lookup if RLS is not yet applied
    }

    // Fall back to security executor if RLS query was empty or unavailable
    if (!requestData) {
      try {
        const applicant = await executor.applicantStatus(userId);
        if (applicant) {
          requestData = {
            status: applicant.status,
            display_name: applicant.displayName,
            email,
            rejection_reason: applicant.rejectionReason,
            created_at: null,
            reviewed_at: null,
          };
        }
      } catch {
        // Executor unavailable
      }
    }

    // 2. Fetch in-app notifications for this applicant
    let notifications: { id: string; title: string; body: string; created_at: string }[] = [];
    try {
      const { data: notifRows } = await verifier
        .from('notifications')
        .select('id, title, body, created_at')
        .eq('recipient_id', userId)
        .order('created_at', { ascending: false });

      if (Array.isArray(notifRows)) {
        notifications = notifRows;
      }
    } catch {
      // Notifications query failure suppressed
    }

    // 3. Clear local auth state; never persist a session
    await verifier.auth.signOut({ scope: 'local' });

    if (!requestData) {
      throw new BackendError('forbidden');
    }

    return NextResponse.json(
      {
        status: requestData.status,
        displayName: requestData.display_name || signInData.user.user_metadata?.display_name || '',
        email: requestData.email || email,
        rejectionReason: requestData.rejection_reason,
        submittedAt: requestData.created_at,
        reviewedAt: requestData.reviewed_at,
        notifications,
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    const safe = publicBackendError(error);
    return NextResponse.json({ error: safe.code, message: safe.message }, { status: safe.status, headers: noStoreHeaders() });
  }
}
