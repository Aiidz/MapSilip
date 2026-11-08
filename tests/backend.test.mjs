import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const output = mkdtempSync(join(tmpdir(), 'mapsilip-foundation-test-'));
after(() => rmSync(output, { recursive: true, force: true }));
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'),
  'app/lib/supabase/env.ts', 'app/lib/supabase/cookies.ts', 'app/lib/backend/security.ts', 'app/lib/backend/identity.ts',
  '--rootDir', 'app/lib', '--outDir', output, '--module', 'commonjs',
  '--target', 'ES2020', '--strict', '--skipLibCheck', '--types', 'node']);
const { getSupabaseEnvironment } = require(join(output, 'supabase/env.js'));
const { createCookieAdapter, supabaseSessionCookieOptions } = require(join(output, 'supabase/cookies.js'));
const { BackendError, publicBackendError, requireMutationOrigin, safeReturnPath } = require(join(output, 'backend/security.js'));
const { verifyIdentity, verifyAuthSession } = require(join(output, 'backend/identity.js'));
const names = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
function configured(url, key, run) {
  const previous = names.map(name => process.env[name]);
  try {
    [url, key].forEach((value, index) => {
      if (value === undefined) delete process.env[names[index]];
      else process.env[names[index]] = value;
    });
    run();
  } finally {
    previous.forEach((value, index) => {
      if (value === undefined) delete process.env[names[index]];
      else process.env[names[index]] = value;
    });
  }
}
const url = 'https://project.supabase.co';
const key = 'sb_publishable_unitTestOnly0123456789';
test('accepts syntactically valid public configuration without contacting a project', () => {
  configured(url, key, () => assert.deepEqual(getSupabaseEnvironment(), { url, publishableKey: key }));
});
test('rejects absent, blank and placeholder configuration', () => {
  for (const value of [undefined, '', '   ', 'sb_publishable_replace_me', 'sb_publishable_your_key']) {
    configured(url, value, () => assert.throws(getSupabaseEnvironment));
  }
  configured('https://your-project-ref.supabase.co', key, () => assert.throws(getSupabaseEnvironment));
});
test('rejects secret and legacy JWT keys without echoing input', () => {
  for (const value of ['sb_secret_sensitive_test_value', 'eyJhbGciOiJIUzI1NiJ9.secret.signature']) {
    configured(url, value, () => assert.throws(getSupabaseEnvironment, error => !error.message.includes(value)));
  }
});
test('rejects insecure or ambiguous project endpoints', () => {
  for (const value of ['http://project.supabase.co', 'https://user:password@project.supabase.co',
    'https://project.supabase.co/path', 'https://project.supabase.co/?token=secret',
    'https://project.supabase.co/#fragment', 'https:project.supabase.co', 'not-a-url']) {
    configured(value, key, () => assert.throws(getSupabaseEnvironment, error => !error.message.includes(value)));
  }
});

test('read-only cookie adapters allow reads but reject refresh writes', () => {
  const adapter = createCookieAdapter(() => [{ name: 'session', value: 'opaque' }]);
  assert.deepEqual(adapter.getAll(), [{ name: 'session', value: 'opaque' }]);
  adapter.setAll([]);
  assert.throws(() => adapter.setAll([{ name: 'session', value: 'new', options: {} }]));
});
test('revoked sessions remain unauthenticated when Auth clears cookies during read-only rendering', async () => {
  const adapter = createCookieAdapter(() => [{ name: 'session', value: 'revoked' }]);
  await assert.rejects(verifyAuthSession({
    getUser: async () => {
      adapter.setAll([{ name: 'session', value: '', options: { maxAge: 0 } }]);
      return { data: { user: null }, error: { status: 401 } };
    },
    getClaims: async () => { throw new Error('Rejected identities must not reach claim verification'); },
  }), error => error.code === 'unauthenticated');
});
test('writable cookie adapters preserve chunks, deletion values and cookie options', () => {
  const written = [];
  const adapter = createCookieAdapter(() => [], (name, value, options) => written.push({ name, value, options }));
  adapter.setAll([
    { name: 'session.0', value: 'chunk', options: { secure: true, sameSite: 'lax', path: '/' } },
    { name: 'session.1', value: '', options: { maxAge: 0, path: '/' } },
  ]);
  assert.deepEqual(written, [
    { name: 'session.0', value: 'chunk', options: { secure: true, sameSite: 'lax', path: '/' } },
    { name: 'session.1', value: '', options: { maxAge: 0, path: '/' } },
  ]);
});
test('cookie persistence failures surface without leaking provider errors', () => {
  const adapter = createCookieAdapter(() => [], () => { throw new Error('secret-cookie-value'); });
  assert.throws(() => adapter.setAll([{ name: 'session', value: 'secret', options: {} }]),
    error => !error.message.includes('secret'));
});
test('server-mediated Auth cookies are HttpOnly, same-site and secure in production', () => {
  assert.deepEqual(supabaseSessionCookieOptions(false), { path: '/', sameSite: 'lax', httpOnly: true, secure: false });
  assert.deepEqual(supabaseSessionCookieOptions(true), { path: '/', sameSite: 'lax', httpOnly: true, secure: true });
});
test('mutations require an exact trusted origin, not request-controlled host headers', () => {
  requireMutationOrigin(new Request('https://app.example/action', { method: 'POST', headers: { origin: 'https://app.example' } }), 'https://app.example');
  for (const origin of [undefined, 'null', 'https://evil.example', 'https://app.example.evil.example', 'https://app.example/path']) {
    const headers = { host: 'app.example', 'x-forwarded-host': 'app.example' };
    if (origin !== undefined) headers.origin = origin;
    assert.throws(() => requireMutationOrigin(new Request('https://app.example/action', { method: 'POST', headers }), 'https://app.example'));
  }
  assert.throws(() => requireMutationOrigin(new Request('https://app.example'), 'https://app.example'));
});

test('local loopback aliases are categorized as an origin mismatch without being accepted', () => {
  const request = new Request('http://localhost:3000/api/auth/signin', {
    method: 'POST', headers: { origin: 'http://127.0.0.1:3000' },
  });
  assert.throws(() => requireMutationOrigin(request, 'http://localhost:3000'), error =>
    error.code === 'forbidden' && error.stage === 'origin_mismatch');
});
test('return paths must match a server-owned allowlist exactly', () => {
  const allowed = ['/management', '/caretaker'];
  assert.equal(safeReturnPath('/caretaker', allowed, '/management'), '/caretaker');
  for (const value of ['https://evil.example', '//evil.example', '/\\evil.example', '/%2f%2fevil.example', '/management?next=https://evil.example', '/tenant', null]) {
    assert.equal(safeReturnPath(value, allowed, '/management'), '/management');
  }
  assert.throws(() => safeReturnPath('/management', ['//evil.example'], '//evil.example'));
});
test('public errors distinguish denial from outages and hide unknown provider details', () => {
  assert.deepEqual(publicBackendError(new BackendError('forbidden')), { status: 403, code: 'forbidden', message: 'Access denied.' });
  assert.deepEqual(publicBackendError(new BackendError('rate_limited', 'rate_limit')),
    { status: 429, code: 'rate_limited', message: 'Too many recent attempts. Wait a little while, then try again.' });
  assert.equal(publicBackendError(new BackendError('unauthenticated')).status, 401);
  assert.equal(publicBackendError(new BackendError('invalid_input')).status, 400);
  const sanitized = publicBackendError(new Error('token=secret database internals'));
  assert.equal(sanitized.status, 503);
  assert.equal(JSON.stringify(sanitized).includes('secret'), false);
});

test('identity verification returns the verified user and session IDs, never metadata roles or access', async () => {
  const userId = '00000000-0000-4000-8000-000000000005';
  const sessionId = '00000000-0000-4000-8000-000000000001';
  const identity = await verifyIdentity({ getUser: async () => ({
    data: { user: { id: userId, app_metadata: { role: 'owner' }, user_metadata: { approved: true } } }, error: null,
  }), getClaims: async () => ({ data: { claims: { sub: userId, session_id: sessionId } }, error: null }) });
  assert.deepEqual(identity, { userId, sessionId, verified: true });
});
test('missing or rejected identities deny access; provider failures remain unavailable', async () => {
  for (const response of [
    { data: { user: null }, error: null },
    { data: { user: null }, error: { name: 'AuthSessionMissingError', status: 400 } },
    { data: { user: null }, error: { status: 401, message: 'secret-token' } },
  ]) {
    await assert.rejects(verifyIdentity({ getUser: async () => response,
      getClaims: async () => ({ data: { claims: null }, error: null }) }), error => publicBackendError(error).status === 401);
  }
  for (const getUser of [
    async () => ({ data: { user: null }, error: { status: 500, message: 'secret-token' } }),
    async () => { throw new Error('secret-token'); },
  ]) {
    await assert.rejects(verifyIdentity({ getUser, getClaims: async () => ({ data: { claims: null }, error: null }) }), error => publicBackendError(error).status === 503 && !error.message.includes('secret'));
  }
});

test('identity verification denies missing, malformed, or subject-mismatched signed session claims', async () => {
  const userId = '00000000-0000-4000-8000-000000000005';
  const user = { data: { user: { id: userId } }, error: null };
  for (const claims of [null, {}, { sub: 'other-user', session_id: '00000000-0000-4000-8000-000000000001' },
    { sub: userId, session_id: 'not-a-session' }]) {
    await assert.rejects(verifyIdentity({ getUser: async () => user,
      getClaims: async () => ({ data: { claims }, error: null }) }), error => publicBackendError(error).status === 401);
  }
});

test('server-only Auth session verification returns the verified email for the fresh-session retry', async () => {
  const userId = '00000000-0000-4000-8000-000000000005';
  const result = await verifyAuthSession({
    getUser: async () => ({ data: { user: { id: userId, email: 'owner@example.invalid', user_metadata: { email: 'forged@example.invalid' } } }, error: null }),
    getClaims: async () => ({ data: { claims: { sub: userId, session_id: '00000000-0000-4000-8000-000000000001' } }, error: null }),
  });
  assert.deepEqual(result, { identity: { userId, sessionId: '00000000-0000-4000-8000-000000000001', verified: true }, email: 'owner@example.invalid' });
});
