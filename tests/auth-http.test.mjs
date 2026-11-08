import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const output = mkdtempSync(join(tmpdir(), 'mapsilip-auth-http-'));
after(() => rmSync(output, { recursive: true, force: true }));
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), 'app/lib/backend/auth/http.ts',
  'app/lib/backend/security.ts', '--rootDir', 'app/lib', '--outDir', output, '--module', 'commonjs',
  '--target', 'ES2020', '--strict', '--skipLibCheck', '--types', 'node'], { stdio: 'pipe' });
const { parseAuthMutation, authResponseBody, applyAuthCookies, safeAuthError, logAuthDiagnostic } = require(join(output, 'backend/auth/http.js'));
const { BackendError, publicBackendError } = require(join(output, 'backend/security.js'));

test('auth mutation parser accepts only small JSON with an exact endpoint field allowlist', async () => {
  assert.deepEqual(await parseAuthMutation(new Request('https://app.test/api/auth/signin', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.invalid', password: 'synthetic' }),
  }), ['email', 'password']), { email: 'owner@example.invalid', password: 'synthetic' });
  for (const request of [
    new Request('https://app.test/', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' }),
    new Request('https://app.test/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'x', role: 'owner' }) }),
    new Request('https://app.test/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' }),
    new Request('https://app.test/', { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '999999' }, body: '{}' }),
  ]) await assert.rejects(parseAuthMutation(request, ['email', 'password']));
});

test('public auth response excludes role, identity, attempt identifiers, credentials, and unsafe redirects', () => {
  assert.deepEqual(authResponseBody({ kind: 'restricted', role: 'owner', userId: 'private-id', sessionId: 'private-session', destination: '/auth/change-password', cookies: [] }),
    { state: 'restricted', destination: '/auth/change-password' });
  assert.deepEqual(authResponseBody({ kind: 'admitted', role: 'caretaker', userId: 'private-id', sessionId: 'private-session', destination: '/caretaker', cookies: [] }),
    { state: 'admitted', destination: '/caretaker' });
  assert.throws(() => authResponseBody({ kind: 'admitted', role: 'owner', destination: 'https://evil.invalid' }));
});

test('cookie construction failure revokes the exact admission and returns a sanitized failure', async () => {
  const response = { cookies: { set() { throw new Error('private cookie failure'); } } };
  let revoked;
  await assert.rejects(applyAuthCookies(response, {
    kind: 'admitted', userId: 'user-id', sessionId: 'session-id', cookies: [{ name: 'sb', value: 'private-token', options: {} }],
  }, async (userId, sessionId) => { revoked = [userId, sessionId]; }), error =>
    publicBackendError(error).status === 503 && !error.message.includes('private cookie failure'));
  assert.deepEqual(revoked, ['user-id', 'session-id']);
});

test('missing cookie writes revoke the exact admission rather than returning a tokenless success', async () => {
  let revoked = false;
  await assert.rejects(applyAuthCookies({ cookies: { set() {} } }, {
    kind: 'admitted', userId: 'user-id', sessionId: 'session-id', cookies: [],
  }, async () => { revoked = true; return true; }), error => publicBackendError(error).status === 503);
  assert.equal(revoked, true);
});

test('unknown provider errors become private no-store responses without serializing details', async () => {
  const response = safeAuthError(new Error('token=private-provider-secret'));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
  const body = await response.text();
  assert.equal(body.includes('private-provider-secret'), false);
  assert.equal(body.includes('token='), false);
});

test('first-login diagnostics expose only stage, status, and category in development', () => {
  const response = safeAuthError(new BackendError('invalid_input', 'first_login_password_update'), 'first_login_completion');
  assert.equal(response.headers.get('x-mapsilip-auth-diagnostic'), 'first_login_password_update;400;invalid_input');
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
});

test('first-login diagnostic response header is omitted in production', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const response = safeAuthError(new BackendError('invalid_input', 'first_login_password_update'), 'first_login_completion');
    assert.equal(response.headers.has('x-mapsilip-auth-diagnostic'), false);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('auth diagnostics log only the stage, HTTP status, and safe error category', () => {
  const original = console.warn;
  const output = [];
  console.warn = (...values) => output.push(values.join(' '));
  try { logAuthDiagnostic('staff_signin', new BackendError('forbidden', 'staff_admission')); }
  finally { console.warn = original; }
  assert.deepEqual(output, ['[mapsilip-auth] {"stage":"staff_admission","status":403,"category":"forbidden"}']);
  return safeAuthError(new BackendError('forbidden', 'staff_admission')).json().then(body => {
    assert.deepEqual(body, { error: 'forbidden', message: 'Access denied.' });
  });
});
