import type { SupabaseClient } from '@supabase/supabase-js';
import { BackendError } from '../security';

export const recoveryGrantCookie = 'mapsilip_recovery_grant';
export function recoveryGrantOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const,
    path: '/api/auth/reset-password', maxAge: 300 };
}
type Grant = { kind: 'pkce' | 'recovery'; credential: string };
function validCredential(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_.-]{16,2048}$/.test(value);
}
/** Carry an unconsumed opaque credential; the reset POST redeems it exactly once with Auth. */
export function captureRecoveryGrant(parameters: URLSearchParams) {
  const code = parameters.get('code');
  const hash = parameters.get('token_hash');
  const grant: Grant | null = validCredential(code) ? { kind: 'pkce', credential: code }
    : validCredential(hash) && parameters.get('type') === 'recovery' ? { kind: 'recovery', credential: hash } : null;
  return grant ? Buffer.from(JSON.stringify(grant)).toString('base64url') : null;
}
export async function redeemRecoveryGrant(auth: Pick<SupabaseClient['auth'], 'exchangeCodeForSession' | 'verifyOtp' | 'getClaims'>, value: string | undefined) {
  let grant: Grant;
  try {
    if (!value || value.length > 4096) throw Error();
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!parsed || !['pkce', 'recovery'].includes(parsed.kind) || !validCredential(parsed.credential) || Object.keys(parsed).length !== 2) throw Error();
    grant = parsed;
  } catch { throw new BackendError('forbidden'); }
  // Cookie/query contents never grant authority. Supabase must consume the email credential.
  const result = grant.kind === 'pkce'
    ? await auth.exchangeCodeForSession(grant.credential)
    : await auth.verifyOtp({ token_hash: grant.credential, type: 'recovery' });
  if (result.error || !result.data.session || !result.data.user) throw new BackendError('forbidden');
  if (grant.kind === 'pkce') {
    const claims = await auth.getClaims();
    const methods = claims.data?.claims?.amr;
    if (claims.error || claims.data?.claims?.sub !== result.data.user.id || !Array.isArray(methods) ||
      !methods.some(entry => entry && typeof entry === 'object' && entry.method === 'recovery')) throw new BackendError('forbidden');
  }
}
