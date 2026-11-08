import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { BackendError } from '../security';

export type PersistentRateLimitExecutor = Readonly<{
  consumeRateLimit(identifierHash: string, clientHash: string): Promise<boolean>;
}>;

export function hashRateLimitBucket(secret: string, kind: 'identifier' | 'client', value: string) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32 ||
      !['identifier', 'client'].includes(kind) || typeof value !== 'string' || !value || value.length > 1024) {
    throw new BackendError('unavailable');
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized || (kind === 'client' && !isIP(normalized))) throw new BackendError('unavailable');
  return createHmac('sha256', secret).update(`${kind}\0${normalized}`, 'utf8').digest('hex');
}

/** Persistent shared rate limiting; no per-instance fallback and no raw identity/IP reaches SQL. */
export async function consumeSigninRateLimit(
  executor: PersistentRateLimitExecutor,
  secret: string,
  email: string,
  clientAddress: string,
) {
  const identifierHash = hashRateLimitBucket(secret, 'identifier', email);
  const clientHash = hashRateLimitBucket(secret, 'client', clientAddress);
  try { return await executor.consumeRateLimit(identifierHash, clientHash); }
  catch { throw new BackendError('unavailable'); }
}

/** Keep public account-request traffic in different persistent buckets from staff sign-in. */
export async function consumeAccountRequestRateLimit(
  executor: PersistentRateLimitExecutor, secret: string, email: string, clientAddress: string,
) {
  if (!isIP(clientAddress)) throw new BackendError('unavailable');
  const identifierHash = hashRateLimitBucket(secret, 'identifier', `account-request:${email}`);
  const clientHash = createHmac('sha256', secret).update(`account-request-client\0${clientAddress}`).digest('hex');
  try { return await executor.consumeRateLimit(identifierHash, clientHash); }
  catch { throw new BackendError('unavailable'); }
}

/** Dedicated persistent bucket for applicant status checks to prevent brute force or resource exhaustion. */
export async function consumeStatusCheckRateLimit(
  executor: PersistentRateLimitExecutor, secret: string, email: string, clientAddress: string,
) {
  if (!isIP(clientAddress)) throw new BackendError('unavailable');
  const identifierHash = hashRateLimitBucket(secret, 'identifier', `applicant-status:${email}`);
  const clientHash = createHmac('sha256', secret).update(`applicant-status-client\0${clientAddress}`).digest('hex');
  try { return await executor.consumeRateLimit(identifierHash, clientHash); }
  catch { throw new BackendError('unavailable'); }
}

/** Limit both known and unknown recovery lookups before accessing Auth Admin. */
export async function consumeRecoveryRateLimit(
  executor: PersistentRateLimitExecutor, secret: string, email: string, clientAddress: string,
) {
  if (!isIP(clientAddress)) throw new BackendError('unavailable');
  const identifierHash = hashRateLimitBucket(secret, 'identifier', `password-recovery:${email}`);
  const clientHash = createHmac('sha256', secret).update(`password-recovery-client\0${clientAddress}`).digest('hex');
  try { return await executor.consumeRateLimit(identifierHash, clientHash); }
  catch { throw new BackendError('unavailable'); }
}
