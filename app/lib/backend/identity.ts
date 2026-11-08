import type { SupabaseClient } from '@supabase/supabase-js';
import { BackendError } from './security';

/** Identity only: this result grants no role, session eligibility or operational access. */
const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function verifyAuthSession(auth: Pick<SupabaseClient['auth'], 'getUser' | 'getClaims'>) {
  try {
    // getUser verifies with Auth. Never trust getSession or editable metadata here.
    const { data, error } = await auth.getUser();
    if (error) {
      if (error.name === 'AuthSessionMissingError' || error.status === 401 || error.status === 403) {
        throw new BackendError('unauthenticated');
      }
      throw new BackendError('unavailable');
    }
    if (!data.user?.id) throw new BackendError('unauthenticated');
    const claims = await auth.getClaims();
    if (claims.error) {
      if (claims.error.status === 401 || claims.error.status === 403) throw new BackendError('unauthenticated');
      throw new BackendError('unavailable');
    }
    const subject = claims.data?.claims?.sub;
    const sessionId = claims.data?.claims?.session_id;
    if (subject !== data.user.id || typeof sessionId !== 'string' || !sessionIdPattern.test(sessionId)) {
      throw new BackendError('unauthenticated');
    }
    return Object.freeze({
      identity: Object.freeze({ userId: data.user.id, sessionId, verified: true as const }),
      email: typeof data.user.email === 'string' ? data.user.email : null,
    });
  } catch (error) {
    if (error instanceof BackendError) throw error;
    throw new BackendError('unavailable');
  }
}

export async function verifyIdentity(auth: Pick<SupabaseClient['auth'], 'getUser' | 'getClaims'>) {
  return (await verifyAuthSession(auth)).identity;
}
