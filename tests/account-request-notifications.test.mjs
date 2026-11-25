import { contractEndDate } from '../app/lib/contract-dates.mjs';
import { manilaToday } from '../app/lib/room-context.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const id = '11111111-1111-4111-8111-111111111111';
const roomId = '22222222-2222-4222-8222-222222222222';

function handler(path, { authorized = true, rooms = [], onSubmit = () => {}, onCreate = () => {}, onReview = () => {} } = {}) {
  class BackendError extends Error {
    constructor(code) { super(code); this.code = code; }
  }
  const executor = {
    accountRequestProvisioningReady: async () => true,
    applicantRoomCatalog: async () => rooms,
    submitAccountRequest: async (...args) => { onSubmit(args); return { state: 'received', id }; },
  };
  const linkFailure = {};
  vm.runInNewContext(ts.transpileModule(readFileSync('app/lib/storage/link-failure.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: linkFailure, process: { env: { STORAGE_MANAGEMENT_ENABLED: 'false' } }, console });
  const modules = {
    '@/app/lib/storage/link-failure': linkFailure,
    '@/app/lib/contract-dates.mjs': { contractEndDate },
    '@/app/lib/room-context.mjs': { manilaToday },
    'next/server': { NextResponse: Response },
    '@/app/lib/backend/auth/dependencies': { assertRequestOrigin() {}, getTrustedClientAddress: () => '127.0.0.1' },
    '@/app/lib/backend/auth/rate-limit': { consumeAccountRequestRateLimit: async () => true },
    '@/app/lib/backend/auth/executor': { getSecurityExecutor: async () => executor },
    '@/app/lib/supabase/env': { getSupabaseEnvironment: () => ({ url: 'https://project.invalid', publishableKey: 'sb_publishable_test' }) },
    '@/app/lib/backend/security': { BackendError, publicBackendError: error => ({ code: error.code || 'unavailable', message: 'Request failed', status: error.code === 'forbidden' ? 403 : error.code === 'invalid_input' ? 400 : 503 }) },
    '@/app/lib/backend/server': { requireStaffAccess: async () => { if (!authorized) throw new BackendError('forbidden'); } },
    '@/app/lib/supabase/server': { createSupabaseServerClient: async () => ({ rpc: async (_name, args) => {
      onReview(args);
      return { error: null, data: { state: args.p_decision, room_id: args.p_room_id, room_number: '101', email: 'applicant@example.invalid', rejection_reason: args.p_note } };
    } }) },
    '@supabase/supabase-js': { createClient: () => ({ auth: { admin: { createUser: async () => { onCreate(); return { data: { user: { id } }, error: null }; } } } }) },
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
  const response = await post({ name: 'Synthetic applicant', email: 'applicant@example.invalid', phone: '', gender: 'female', password: 'synthetic-password', confirm_password: 'synthetic-password' });
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

for (const invalid of [
  { contract_attachment_id: 'not-a-uuid' },
  { started_on: 'tomorrow' },
  { started_on: '2026-02-30' },
]) {
  test(`approval rejects malformed contract input: ${JSON.stringify(invalid)}`, async () => {
    const response = await handler('app/api/account-requests/review/route.ts')({ id, decision: 'approved', room_id: roomId, ...invalid });
    assert.equal(response.status, 400);
  });
}
test('rejection requires an applicant-facing reason', async () => {
  const response = await handler('app/api/account-requests/review/route.ts')({ id, decision: 'rejected', note: '   ' });
  assert.equal(response.status, 400);
});
test('approval keeps the end date explicitly chosen by the admin', async () => {
  let review;
  const response = await handler('app/api/account-requests/review/route.ts', { onReview: args => { review = args; } })({
    id, decision: 'approved', room_id: roomId, started_on: '2026-12-15',
    contract_attachment_id: '33333333-3333-4333-8333-333333333333', contract_end_on: '2027-01-01',
  });
  assert.equal(response.status, 200);
  assert.equal(review.p_started_on, '2026-12-15');
  assert.equal(review.p_contract_end_on, '2027-01-01');
  assert.equal(contractEndDate('2023-08-31'), '2024-02-29');
  assert.equal(contractEndDate('2026-12-01'), '2027-05-31');
  assert.equal(contractEndDate('2026-12-15'), '2027-06-30');
  assert.equal(contractEndDate('2026-12-15', '2026-12-14'), null);
});

const application = { name: 'Synthetic applicant', email: 'applicant@example.invalid', gender: 'female', password: 'synthetic-password', confirm_password: 'synthetic-password', preferred_room_id: roomId };
for (const room of [null, { availability: 'available', vacancies: 1, gender_policy: 'male' }, { availability: 'available', vacancies: 0, gender_policy: 'any' }, { availability: 'maintenance', vacancies: 2, gender_policy: 'any' }]) {
 test(`ineligible preference is rejected before creating an identity: ${JSON.stringify(room)}`, async () => {
  let created = 0; let submitted = 0;
  const response = await handler('app/api/account-requests/route.ts', { rooms: room ? [{ ...room, id: roomId }] : [], onCreate: () => created++, onSubmit: () => submitted++ })(application);
  assert.equal(response.status, 409); assert.equal(created, 0); assert.equal(submitted, 0);
 });
}
test('eligible preference is forwarded to guarded submission without assigning a room', async () => {
 let args;
 const response = await handler('app/api/account-requests/route.ts', { rooms: [{ id: roomId, availability: 'available', vacancies: 1, gender_policy: 'female' }], onSubmit: values => args = values })(application);
 assert.equal(response.status, 202); assert.equal(args[5], roomId); assert.equal(args[4], 'female');
});
