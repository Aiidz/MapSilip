import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const output = mkdtempSync(join(tmpdir(), 'mapsilip-tenant-auth-'));
after(() => rmSync(output, { recursive: true, force: true }));
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'),
  'app/lib/backend/tenant-access.ts', 'app/lib/backend/security.ts',
  '--rootDir', 'app/lib', '--outDir', output, '--module', 'commonjs',
  '--target', 'ES2020', '--strict', '--skipLibCheck', '--types', 'node'], { stdio: 'pipe' });
const { authorizeTenantProfile } = require(join(output, 'backend/tenant-access.js'));
const userId = '00000000-0000-4000-8000-000000000001';

test('tenant access requires a verified identity linked to the exact profile row', () => {
  assert.deepEqual(authorizeTenantProfile({ userId, verified: true }, { user_id: userId }), { userId });
  for (const [identity, profile] of [
    [null, { user_id: userId }],
    [{ userId, verified: false }, { user_id: userId }],
    [{ userId, verified: true }, null],
    [{ userId, verified: true }, { user_id: '00000000-0000-4000-8000-000000000002' }],
  ]) assert.throws(() => authorizeTenantProfile(identity, profile));
  assert.deepEqual(authorizeTenantProfile({ userId, verified: true, role: 'owner' }, { user_id: userId }), { userId });
});

test('tenant profile SQL grants only own-row reads and has no client write policy', () => {
  const sql = readFileSync('supabase/migrations/20261026123837_tenant_profiles.sql', 'utf8');
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /grant select on public\.tenant_profiles to authenticated/i);
  assert.match(sql, /auth\.uid\(\)\s*\)\s*=\s*user_id/i);
  assert.doesNotMatch(sql, /grant\s+(?:insert|update|delete|all)\s+on\s+public\.tenant_profiles\s+to\s+(?:anon|authenticated)/i);
  assert.doesNotMatch(sql, /create policy[\s\S]*(?:for\s+(?:insert|update|delete|all))/i);
});

test('tenant profile pages resolve records from the verified server session', () => {
  const source = readFileSync('app/tenant/details/page.tsx', 'utf8');
  assert.match(source, /getTenantProfile/);
  assert.doesNotMatch(source, /searchParams|user_metadata|app_metadata/);
  const layout = readFileSync('app/tenant/layout.tsx', 'utf8');
  assert.match(layout, /requireTenantAccess/);
});

test('tenant sign-in verifies Auth identity and requires a linked database profile before session persistence', () => {
  const source = readFileSync('app/lib/backend/tenant-auth.ts', 'utf8');
  assert.match(source, /signInWithPassword/);
  assert.match(source, /auth\.getUser\(\)/);
  assert.match(source, /\.eq\('user_id', user\.id\)/);
  assert.match(source, /auth\.signOut\(\{ scope: 'local' \}\)/);
  assert.ok(source.indexOf("\.eq('user_id', user.id)") < source.indexOf('auth.setSession('),
    'the cookie-backed session is persisted only after the DB profile check');
  assert.match(source, /persistSession:\s*false/);
  const route = readFileSync('app/api/auth/signin/route.ts', 'utf8');
  assert.match(route, /assertTenantAuthEnabled/);
  assert.match(route, /assertRequestOrigin/);
  assert.match(route, /tenantSignIn/);
});

test('tenant sign-out is same-origin, server-side, global, and unavailable by default', () => {
  const activation = readFileSync('app/lib/backend/tenant-activation.ts', 'utf8');
  const signout = readFileSync('app/api/tenant/auth/signout/route.ts', 'utf8');
  assert.match(activation, /MAPSILIP_TENANT_AUTH_ENABLED === 'true'/);
  assert.match(signout, /assertTenantAuthEnabled/);
  assert.match(signout, /assertRequestOrigin/);
  assert.match(signout, /auth\.signOut\(\{ scope: 'global' \}\)/);
});

test('shared password recovery uses Supabase Auth and only allows fixed local callback paths', () => {
  const recovery = readFileSync('app/api/auth/recover/route.ts', 'utf8');
  const callback = readFileSync('app/auth/callback/route.ts', 'utf8');
  const reset = readFileSync('app/api/auth/reset-password/route.ts', 'utf8');
  assert.match(recovery, /auth\.resetPasswordForEmail/);
  assert.match(recovery, /getTrustedAppOrigin/);
  assert.match(recovery, /auth\/callback\?next=\/reset-password/);
  assert.match(callback, /exchangeCodeForSession/);
  assert.match(callback, /verifyOtp/);
  assert.match(callback, /safeReturnPath/);
  assert.match(callback, /\['\/reset-password', '\/login', '\/activate'\]/);
  assert.match(reset, /beginStaffSignin/);
  assert.match(reset, /tenant_profiles/);
  assert.doesNotMatch(reset, /requireTenantAccess/);
  assert.match(reset, /auth\.updateUser\(\{ password \}\)/);
  assert.match(reset, /auth\.signOut\(\{ scope: 'global' \}\)/);
});
