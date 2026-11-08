import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const output = mkdtempSync(join(tmpdir(), 'mapsilip-tenant-claim-'));
after(() => rmSync(output, { recursive: true, force: true }));
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'),
  'app/lib/backend/tenant-access.ts', 'app/lib/backend/security.ts',
  '--rootDir', 'app/lib', '--outDir', output, '--module', 'commonjs',
  '--target', 'ES2020', '--strict', '--skipLibCheck', '--types', 'node']);
const { claimApprovedTenantAccount } = require(join(output, 'backend/tenant-access.js'));

const session = { access_token: 'test-access', refresh_token: 'test-refresh' };
function auth(overrides = {}) {
  let signouts = 0;
  return {
    client: {
      signInWithPassword: async () => ({ data: { session, user: { id: 'tenant-1' } }, error: null }),
      getUser: async () => ({ data: { user: { id: 'tenant-1', email: 'tenant@example.test' } }, error: null }),
      signOut: async () => { signouts++; return { error: null }; },
      ...overrides,
    },
    signouts: () => signouts,
  };
}

test('confirmed tenant can finish an approved invitation with password before session persistence', async () => {
  const { client } = auth();
  const calls = [];
  const claim = async (id, hash) => { calls.push({ id, hash }); return { data: { state: 'activated' }, error: null }; };
  const result = await claimApprovedTenantAccount(client, claim, 'tenant@example.test', 'saved-password', 'request-1', 'hash-1');
  assert.deepEqual(result, session);
  assert.deepEqual(calls, [{ id: 'request-1', hash: 'hash-1' }]);
});

test('wrong credentials or mismatched Auth identity never claim the invitation', async () => {
  for (const overrides of [
    { signInWithPassword: async () => ({ data: { session: null }, error: { status: 400 } }) },
    { getUser: async () => ({ data: { user: { id: 'other', email: 'other@example.test' } }, error: null }) },
  ]) {
    const { client } = auth(overrides);
    let called = false;
    await assert.rejects(claimApprovedTenantAccount(client, async () => { called = true; return { data: { state: 'activated' } }; },
      'tenant@example.test', 'saved-password', 'request-1', 'hash-1'));
    assert.equal(called, false);
  }
});

test('a rejected claim clears the temporary Auth session', async () => {
  const { client, signouts } = auth();
  await assert.rejects(claimApprovedTenantAccount(client, async () => ({ data: null, error: { code: '42501' } }),
    'tenant@example.test', 'saved-password', 'request-1', 'hash-1'));
  assert.equal(signouts(), 1);
});
