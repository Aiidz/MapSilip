import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const output = mkdtempSync(join(tmpdir(), 'mapsilip-auth-executor-'));
after(() => rmSync(output, { recursive: true, force: true }));
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'),
  'app/lib/backend/auth/executor.ts', 'app/lib/backend/security.ts',
  '--rootDir', 'app/lib', '--outDir', output, '--module', 'commonjs', '--target', 'ES2020',
  '--strict', '--skipLibCheck', '--types', 'node', '--esModuleInterop'], { stdio: 'pipe' });
const { parseSecurityDatabaseUrl, createSecurityExecutor, getSecurityDatabaseUrl } = require(join(output, 'backend/auth/executor.js'));
const validUrl = 'postgresql://mapsilip_security_executor.atuqxpiandeutimdkgag:synthetic@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=verify-full&sslrootcert=%2Ftmp%2Fmapsilip-supabase-ca.crt';

function fakePool(responses) {
  const calls = [];
  let index = 0;
  let releases = 0;
  return { calls, releases: () => releases,
    async connect() { return { async query(text, values) {
      calls.push({ text, values });
      const item = responses[index++];
      if (item instanceof Error) throw item;
      return item;
    }, release() { releases++; } }; },
  };
}
const roleRow = { rows: [{ role_name: 'mapsilip_security_executor', can_login: true, can_replicate: false, superuser: false,
  bypass_rls: false, can_create_role: false, can_create_db: false, inherits: false, has_untrusted_memberships: false }] };

test('executor accepts only a TLS transaction-pool connection URL and never reads public keys as fallback', () => {
  const parsed = parseSecurityDatabaseUrl(validUrl);
  assert.equal(parsed.hostname, 'aws-0-ap-northeast-1.pooler.supabase.com');
  assert.equal(parsed.username, 'mapsilip_security_executor.atuqxpiandeutimdkgag');
  assert.equal(parsed.searchParams.get('sslmode'), 'verify-full');
  assert.equal(parsed.searchParams.get('sslrootcert'), '/tmp/mapsilip-supabase-ca.crt');
  for (const value of ['', 'postgres://u:p@localhost:5432/postgres',
    'postgres://u:p@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=disable',
    'postgres://u:p@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&options=-csearch_path%3Dpublic',
    'postgres://u:p@db.example.com:6543/postgres?sslmode=require',
    'postgres://u@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require',
    'postgres://u:p@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=prefer',
    'postgres://mapsilip_security_executor.atuqxpiandeutimdkgag:p@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=require',
    'postgres://mapsilip_security_executor.atuqxpiandeutimdkgag:p@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=verify-full',
    'postgres://mapsilip_security_executor.otherproject:p@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=verify-full&sslrootcert=%2Ftmp%2Fca.crt',
    'postgres://mapsilip_security_executor.atuqxpiandeutimdkgag:p@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=verify-full&sslrootcert=relative.crt']) {
    assert.throws(() => parseSecurityDatabaseUrl(value));
  }
  assert.throws(() => getSecurityDatabaseUrl({ NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_publicOnly' }));
});

test('production executor uses a fixed parameterized function allowlist after least-privilege role verification', async () => {
  const pool = fakePool([roleRow, { rows: [{ result: { result: 'admitted', user_id: 'user', session_id: 'session', role: 'owner', security_revision: '7' } }] }]);
  const executor = createSecurityExecutor(pool);
  const response = await executor.finishStaffSignin('attempt-id', 'user', 'session');
  assert.equal(response.result, 'admitted');
  assert.equal(pool.calls[0].text.includes('pg_auth_members'), true);
  assert.equal(pool.calls[1].text, 'select mapsilip_private.finish_staff_signin($1, $2, $3) as result');
  assert.deepEqual(pool.calls[1].values, ['attempt-id', 'user', 'session']);
  assert.equal(pool.releases(), 1);
});

test('account provisioning preflight fails closed until both onboarding database functions exist', async () => {
  const pool = fakePool([roleRow, { rows: [{ result: { ready: false } }] },
    roleRow, { rows: [{ result: { ready: true } }] }]);
  const executor = createSecurityExecutor(pool);
  assert.equal(await executor.accountRequestProvisioningReady(), false);
  assert.equal(await executor.accountRequestProvisioningReady(), true);
  assert.match(pool.calls[1].text, /to_regprocedure\('mapsilip_private\.submit_account_request\(text,text,text,uuid\)'\)/);
  assert.equal(pool.releases(), 2);
});

test('executor refuses the wrong, inherited, privileged or RLS-bypassing database role', async () => {
  const pool = fakePool([{ rows: [{ ...roleRow.rows[0], role_name: 'postgres' }] }, roleRow,
    { rows: [{ result: true }] }, { rows: [{ ...roleRow.rows[0], has_untrusted_memberships: true }] }]);
  const executor = createSecurityExecutor(pool);
  await assert.rejects(executor.consumeRateLimit('a'.repeat(64), 'b'.repeat(64)));
  assert.equal(pool.calls.length, 1, 'security command is not issued after the role check fails');
  assert.equal(pool.releases(), 1);
  assert.equal(await executor.consumeRateLimit('a'.repeat(64), 'b'.repeat(64)), true);
  assert.equal(pool.calls.length, 3);
  await assert.rejects(executor.consumeRateLimit('a'.repeat(64), 'b'.repeat(64)));
  assert.equal(pool.calls.length, 4);
  assert.equal(pool.releases(), 3);
});

test('executor membership check permits only the trusted postgres administrator as a member', () => {
  const source = require('node:fs').readFileSync('app/lib/backend/auth/executor.ts', 'utf8');
  assert.match(source, /m\.member\s*=\s*r\.oid/);
  assert.match(source, /join\s+pg_catalog\.pg_roles\s+mem\s+on\s+mem\.oid\s*=\s*m\.member/);
  assert.match(source, /m\.roleid\s*=\s*r\.oid\s+and\s+mem\.rolname\s*<>\s*'postgres'/);
  assert.match(source, /as has_untrusted_memberships/);
});

test('database errors are sanitized and checked-out connections are always released', async () => {
  const pool = fakePool([roleRow, new Error('password=private-credential')]);
  const executor = createSecurityExecutor(pool);
  await assert.rejects(executor.beginStaffSignin('synthetic@example.invalid'), error => !error.message.includes('private-credential'));
  assert.equal(pool.releases(), 1);
});
