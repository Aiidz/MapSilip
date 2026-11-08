import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync('app/api/auth/recover/route.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function recoveryHandler(providerError, exists = true, origin = 'http://localhost:3000') {
  class MockResponse extends Response {
    writes = [];
    cookies = { set: (...args) => this.writes.push(args) };
    static json(body, init) { return new MockResponse(JSON.stringify(body), init); }
  }
  const modules = {
    'next/server': { NextResponse: MockResponse },
    '@/app/lib/backend/auth/dependencies': { assertRequestOrigin() {}, getTrustedAppOrigin: () => origin, getTrustedClientAddress: () => '127.0.0.1' },
    '@/app/lib/backend/auth/recovery': { recoveryEmailExists: async () => exists },
    '@/app/lib/backend/auth/executor': { getSecurityExecutor: async () => ({}) },
    '@/app/lib/backend/auth/rate-limit': { consumeRecoveryRateLimit: async () => true },
    '@/app/lib/backend/auth/activation': { isStaffAuthEnabled: () => true },
    '@/app/lib/backend/tenant-activation': { isTenantAuthEnabled: () => true },
    '@/app/lib/backend/security': { BackendError: class extends Error {} },
    '@/app/lib/backend/auth/http': {
      noStoreHeaders: () => ({ 'Cache-Control': 'private, no-store' }),
      parseAuthMutation: async () => ({ email: 'person@example.invalid' }),
      safeAuthError: () => MockResponse.json({ error: 'unavailable' }, { status: 503 }),
    },
    '@/app/lib/supabase/env': { getSupabaseEnvironment: () => ({ url: 'https://project.invalid', publishableKey: 'public' }) },
    '@/app/lib/supabase/cookies': { supabaseSessionCookieOptions: () => ({ httpOnly: true }) },
    '@supabase/ssr': { createServerClient: (_url, _key, options) => ({ auth: {
      resetPasswordForEmail: async (_email, { redirectTo }) => {
        assert.equal(redirectTo, `${origin}/auth/callback?next=/reset-password`);
        assert.equal(options.cookies.getAll()[0].value, 'original-verifier');
        options.cookies.setAll([{ name: 'pkce', value: providerError ? '' : 'new-verifier', options: { httpOnly: true } }]);
        return { error: providerError };
      },
    } }) },
  };
  const exports = {};
  vm.runInNewContext(source, { exports, process: { env: { MAPSILIP_RATE_LIMIT_HASH_KEY: 'test-secret' } }, require: name => {
    assert.ok(modules[name], `Unexpected module: ${name}`);
    return modules[name];
  } });
  return () => exports.POST({ cookies: { getAll: () => [{ name: 'pkce', value: 'original-verifier' }] } });
}

test('successful reset email commits the new verifier cookie', async () => {
  const response = await recoveryHandler(null)();
  assert.equal(response.status, 200);
  assert.equal(response.writes[0][1], 'new-verifier');
});

test('production recovery sends Supabase Auth the permanent HTTPS callback', async () => {
  const response = await recoveryHandler(null, true, 'https://mapsilip.vercel.app')();
  assert.equal(response.status, 200);
  assert.equal(response.writes[0][1], 'new-verifier');
});

test('unregistered recovery email returns an error without changing verifier cookies', async () => {
  const response = await recoveryHandler(null, false)();
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'account_not_found');
  assert.equal(response.writes.length, 0);
});

test('rate limited resend preserves the previous email verifier and returns a retry delay', async () => {
  const response = await recoveryHandler({ status: 429 })();
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '60');
  assert.equal(response.writes.length, 0);
});

test('other email failures do not overwrite the previous verifier', async () => {
  const response = await recoveryHandler({ status: 500 })();
  assert.equal(response.status, 503);
  assert.equal(response.writes.length, 0);
});
