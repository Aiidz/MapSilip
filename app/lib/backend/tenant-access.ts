import { BackendError } from './security';

export type VerifiedTenantIdentity = Readonly<{ userId: string; verified: true }>;
export type TenantProfile = Readonly<{ user_id: string; display_name?: string }>;

export function authorizeTenantProfile(identity: unknown, profile: unknown) {
  if (!identity || typeof identity !== 'object' ||
      (identity as Record<string, unknown>).verified !== true ||
      typeof (identity as Record<string, unknown>).userId !== 'string' ||
      !profile || typeof profile !== 'object' || Array.isArray(profile) ||
      (profile as Record<string, unknown>).user_id !== (identity as Record<string, unknown>).userId) {
    throw new BackendError('forbidden');
  }
  return Object.freeze({ userId: (identity as VerifiedTenantIdentity).userId });
}

type ActivationSession = { access_token: string; refresh_token: string };
type ActivationAuth = {
  signInWithPassword(input: { email: string; password: string }): Promise<{
    data: { session: ActivationSession | null; user?: { id: string } | null }; error: unknown;
  }>;
  getUser(): Promise<{ data: { user: { id: string; email?: string | null } | null }; error: unknown }>;
  signOut(input: { scope: 'local' }): Promise<unknown>;
};

/** A confirmed Auth identity may claim only the invitation for its verified email. */
export async function claimApprovedTenantAccount(
  auth: ActivationAuth,
  claim: (id: string, hash: string) => Promise<{ data: unknown; error?: { code?: string } | null }>,
  expectedEmail: string,
  password: string,
  requestId: string,
  invitationHash: string,
): Promise<ActivationSession> {
  try {
    const signedIn = await auth.signInWithPassword({ email: expectedEmail, password });
    if (signedIn.error || !signedIn.data.session || !signedIn.data.user?.id) {
      throw new BackendError('unauthenticated');
    }
    const verified = await auth.getUser();
    if (verified.error || verified.data.user?.id !== signedIn.data.user.id ||
        verified.data.user.email?.toLowerCase() !== expectedEmail.toLowerCase()) {
      throw new BackendError('forbidden');
    }
    const result = await claim(requestId, invitationHash);
    if (result.error) throw new BackendError(result.error.code === '42501' ? 'forbidden' : 'unavailable');
    if (!result.data || typeof result.data !== 'object' ||
        (result.data as { state?: unknown }).state !== 'activated') throw new BackendError('forbidden');
    return signedIn.data.session;
  } catch (error) {
    try { await auth.signOut({ scope: 'local' }); } catch { /* preserve the original failure */ }
    throw error;
  }
}
