import { BackendError, publicBackendError } from '../security';
import type { CookieOptions } from '@supabase/ssr';
import type { AuthCookieWrite } from './service';

const MAX_AUTH_BODY_BYTES = 8 * 1024;

/** Reads a bounded JSON object and rejects unexpected fields before credentials reach Auth. */
export async function parseAuthMutation<const Fields extends readonly string[]>(
  request: Request, allowedFields: Fields,
): Promise<Record<Fields[number], string>> {
  if (request.method !== 'POST' || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')) {
    throw new BackendError('invalid_input');
  }
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_AUTH_BODY_BYTES)) {
    throw new BackendError('invalid_input');
  }
  if (!request.body) throw new BackendError('invalid_input');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_AUTH_BODY_BYTES) {
        await reader.cancel();
        throw new BackendError('invalid_input');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof BackendError) throw error;
    throw new BackendError('invalid_input');
  }
  let parsed: unknown;
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new BackendError('invalid_input');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new BackendError('invalid_input');
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== allowedFields.length || keys.some(key => !allowedFields.includes(key)) ||
      keys.some(key => typeof record[key] !== 'string')) throw new BackendError('invalid_input');
  return Object.freeze(record) as Record<Fields[number], string>;
}

/** Public responses contain no roles, provider identities, attempt IDs, or cookie contents. */
export function authResponseBody(result: { kind: string; role?: string; destination?: string }) {
  const valid = (result.kind === 'restricted' && result.destination === '/auth/change-password') ||
    (result.kind === 'admitted' && result.role === 'owner' && result.destination === '/management') ||
    (result.kind === 'admitted' && result.role === 'caretaker' && result.destination === '/caretaker') ||
    (result.kind === 'completed' && result.role === 'owner' && result.destination === '/management') ||
    (result.kind === 'completed' && result.role === 'caretaker' && result.destination === '/caretaker');
  if (!valid) throw new BackendError('unavailable');
  return Object.freeze({ state: result.kind, destination: result.destination });
}

export function noStoreHeaders() {
  return { 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache', 'X-Content-Type-Options': 'nosniff', Vary: 'Cookie' };
}

export function safeAuthError(error: unknown, fallbackStage?: string) {
  const result = publicBackendError(error);
  const headers = new Headers(noStoreHeaders());
  if (process.env.NODE_ENV !== 'production' && fallbackStage) {
    const stage = error instanceof BackendError && error.stage ? error.stage : fallbackStage;
    headers.set('X-MapSilip-Auth-Diagnostic', `${stage};${result.status};${result.code}`);
  }
  return Response.json({ error: result.code, message: result.message }, { status: result.status, headers });
}

/** Development-only diagnostic: never logs request values, identities, provider messages, or tokens. */
export function logAuthDiagnostic(stage: string, error: unknown) {
  if (process.env.NODE_ENV === 'production') return;
  const result = publicBackendError(error);
  const safeStage = error instanceof BackendError && error.stage ? error.stage : stage;
  console.warn(`[mapsilip-auth] ${JSON.stringify({ stage: safeStage, status: result.status, category: result.code })}`);
}

/** Cookie construction failure revokes the just-created admission; failure stays fail-closed. */
export async function applyAuthCookies(
  response: { cookies: { set(name: string, value: string, options: CookieOptions): unknown } },
  result: { userId: string; sessionId: string; cookies: readonly AuthCookieWrite[] },
  revoke: (userId: string, sessionId: string) => Promise<boolean>,
) {
  try {
    if (!result.cookies.length) throw new Error('missing cookie writes');
    for (const { name, value, options } of result.cookies) response.cookies.set(name, value, options);
  } catch {
    try { await revoke(result.userId, result.sessionId); } catch { /* Access remains denied by the database admission protocol. */ }
    throw new BackendError('unavailable');
  }
}
