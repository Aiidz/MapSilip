import { BackendError, requireMutationOrigin } from '../security';
import { getSecurityExecutor } from './executor';
import { consumeSigninRateLimit } from './rate-limit';
import { createSupabaseAuthGateway } from './session';
import type { StaffAuthDependencies } from './service';

export type IncomingCookie = Readonly<{ name: string; value: string }>;

export function getTrustedAppOrigin(environment: NodeJS.ProcessEnv = process.env) {
  const value = environment.MAPSILIP_APP_ORIGIN;
  if (!value) throw new BackendError('unavailable');
  try {
    const parsed = new URL(value);
    const local = environment.NODE_ENV !== 'production' && parsed.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.origin !== value || (!local && parsed.protocol !== 'https:')) throw new Error();
    return value;
  } catch {
    throw new BackendError('unavailable');
  }
}

export function getTrustedClientAddress(request: Request, environment: NodeJS.ProcessEnv = process.env) {
  if (environment.NODE_ENV !== 'production' && environment.VERCEL !== '1') return '127.0.0.1';
  if (environment.VERCEL !== '1') throw new BackendError('unavailable');
  const value = request.headers.get('x-vercel-forwarded-for');
  // Vercel overwrites this header at ingress. Reject lists and arbitrary forwarded headers.
  if (!value || value.includes(',') || !/^(?:\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]+$/.test(value)) {
    throw new BackendError('unavailable');
  }
  return value;
}

export async function createStaffAuthDependencies(requestCookies: readonly IncomingCookie[]): Promise<StaffAuthDependencies> {
  const secret = process.env.MAPSILIP_RATE_LIMIT_HASH_KEY;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) throw new BackendError('unavailable');
  const executor = await getSecurityExecutor();
  return {
    consumeRateLimit: (email, address) => consumeSigninRateLimit(executor, secret, email, address),
    beginStaffSignin: email => executor.beginStaffSignin(email),
    finishStaffSignin: (attemptId, userId, sessionId) => executor.finishStaffSignin(attemptId, userId, sessionId),
    beginFirstLoginChange: (userId, sessionId) => executor.beginFirstLoginChange(userId, sessionId),
    hasOnlyAuthSession: (userId, sessionId) => executor.hasOnlyAuthSession(userId, sessionId),
    revokeSessionAdmission: (userId, sessionId) => executor.revokeSessionAdmission(userId, sessionId),
    completeFirstLogin: (attemptId, userId, sessionId, passwordUpdated, globallyRevoked) =>
      executor.completeFirstLogin(attemptId, userId, sessionId, passwordUpdated, globallyRevoked),
    reconcileFirstLogin: (attemptId, userId, sessionId) => executor.reconcileFirstLogin(attemptId, userId, sessionId),
    auth: createSupabaseAuthGateway(requestCookies),
    now: () => Date.now(),
  };
}

export function assertRequestOrigin(request: Request) {
  requireMutationOrigin(request, getTrustedAppOrigin());
}
