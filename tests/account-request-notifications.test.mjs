import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const id = '11111111-1111-4111-8111-111111111111';
const roomId = '22222222-2222-4222-8222-222222222222';

function handler(path, { authorized = true } = {}) {
  class BackendError extends Error {
    constructor(code) { super(code); this.code = code; }
  }
  const executor = {
    accountRequestProvisioningReady: async () => true,
    submitAccountRequest: async () => ({ state: 'received', id }),
  };
  const modules = {
    'next/server': { NextResponse: Response },
    '@/app/lib/backend/auth/dependencies': { assertRequestOrigin() {}, getTrustedClientAddress: () => '127.0.0.1' },
    '@/app/lib/backend/auth/rate-limit': { consumeAccountRequestRateLimit: async () => true },
    '@/app/lib/backend/auth/executor': { getSecurityExecutor: async () => executor },
    '@/app/lib/supabase/env': { getSupabaseEnvironment: () => ({ url: 'https://project.invalid', publishableKey: 'sb_publishable_test' }) },
    '@/app/lib/backend/security': { BackendError, publicBackendError: error => ({ code: error.code || 'unavailable', message: 'Request failed', status: error.code === 'forbidden' ? 403 : error.code === 'invalid_input' ? 400 : 503 }) },
    '@/app/lib/backend/server': { requireStaffAccess: async () => { if (!authorized) throw new BackendError('forbidden'); } },
    '@/app/lib/supabase/server': { createSupabaseServerClient: async () => ({ rpc: async (_name, args) => ({ error: null, data: { state: args.p_decision, room_id: args.p_room_id, room_number: '101', email: 'applicant@example.invalid', rejection_reason: args.p_note } }) }) },
    '@supabase/supabase-js': { createClient: () => ({ auth: { admin: { createUser: async () => ({ data: { user: { id } }, error: null }) } } }) },
  };
  const exports = {};
  const source = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports, process: { env: { NODE_ENV: 'production', MAPSILIP_RATE_LIMIT_HASH_KEY: 'test-secret', SUPABASE_SERVICE_ROLE_KEY: 'server-only-test' } }, require: name => {
    assert.ok(modules[name], `Unexpected module: ${name}`);
    return modules[name];
  } });
  return body => exports.POST(new Request('https://mapsilip.vercel.app/api/account-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
}

test('account submission succeeds without an external email provider', async () => {
  const post = handler('app/api/account-requests/route.ts');
  const response = await post({ name: 'Synthetic applicant', email: 'applicant@example.invalid', phone: '', password: 'synthetic-password', confirm_password: 'synthetic-password' });
  assert.equal(response.status, 202);
  const result = await response.json();
  assert.equal(result.state, 'received');
  assert.equal('email_delivery' in result, false);
});

for (const decision of ['approved', 'rejected']) {
  test(`${decision} account decisions succeed without external email delivery`, async () => {
    const response = await handler('app/api/account-requests/review/route.ts')({ id, decision, room_id: roomId, note: 'No vacancy' });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.state, decision);
    assert.equal('email_delivery' in result, false);
  });
}

test('removing email delivery preserves the owner authorization gate', async () => {
  const response = await handler('app/api/account-requests/review/route.ts', { authorized: false })({ id, decision: 'approved', room_id: roomId });
  assert.equal(response.status, 403);
});

test('approval still rejects a missing room assignment', async () => {
  const response = await handler('app/api/account-requests/review/route.ts')({ id, decision: 'approved' });
  assert.equal(response.status, 400);
});
