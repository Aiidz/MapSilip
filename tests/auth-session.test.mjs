import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Module = require('node:module');
process.env.NODE_PATH = join(process.cwd(), 'node_modules');
Module._initPaths();
const output = mkdtempSync(join(tmpdir(), 'mapsilip-auth-session-'));
after(() => rmSync(output, { recursive: true, force: true }));
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), 'app/lib/backend/auth/session.ts',
  'app/lib/backend/identity.ts', 'app/lib/backend/security.ts', 'app/lib/supabase/env.ts',
  '--rootDir', 'app/lib', '--outDir', output, '--module', 'commonjs', '--target', 'ES2020',
  '--strict', '--skipLibCheck', '--types', 'node', '--esModuleInterop'], { stdio: 'pipe' });
const { createSupabaseAuthGateway } = require(join(output, 'backend/auth/session.js'));
const env = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
const previous = env.map(name => process.env[name]);
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://session-test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_sessionTestOnly123';
after(() => previous.forEach((value, index) => value === undefined ? delete process.env[env[index]] : process.env[env[index]] = value));
const userId = '00000000-0000-4000-8000-000000000021';
const oldSession = '00000000-0000-4000-8000-000000000022';
const freshSession = '00000000-0000-4000-8000-000000000023';

function factoryFixture() {
  const clients = [];
  const factory = (_url, _key, options) => {
    const state = { cookieInput: options.cookies.getAll(), cookieOptions: options.cookieOptions, updates: [], signouts: [], writes: [] };
    const clientIndex = clients.length;
    const sessionId = clientIndex === 0 ? oldSession : freshSession;
    const auth = {
      async signInWithPassword({ email, password }) {
        state.signIn = { email, password };
        options.cookies.setAll([{ name: 'sb-auth.0', value: `token-${sessionId}`, options: { path: '/', httpOnly: true } }]);
        return { data: { session: { access_token: `private-${sessionId}`, refresh_token: 'private-refresh' } }, error: null };
      },
      async getUser() { return { data: { user: { id: userId, email: 'owner@example.invalid', user_metadata: { role: 'caretaker' } } }, error: null }; },
      async getClaims() { return { data: { claims: { sub: userId, session_id: sessionId } }, error: null }; },
      async updateUser(attributes) { state.updates.push(attributes); return { data: { user: { id: userId } }, error: null }; },
      async signOut(signOutOptions) {
        state.signouts.push(signOutOptions);
        options.cookies.setAll([{ name: 'sb-auth.0', value: '', options: { path: '/', maxAge: 0 } }]);
        return { error: null };
      },
    };
    clients.push({ state, auth });
    return { auth };
  };
  return { factory, clients };
}

test('Auth gateway buffers verified sign-in cookies and returns no access or refresh tokens', async () => {
  const { factory, clients } = factoryFixture();
  const gateway = createSupabaseAuthGateway([], factory);
  const result = await gateway.signIn('owner@example.invalid', 'synthetic-temp-password');
  assert.deepEqual(result.identity, { userId, sessionId: freshSession, verified: true });
  assert.equal(result.cookies.length, 1);
  assert.deepEqual(clients[0].state.cookieOptions, { path: '/', sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' });
  assert.equal(JSON.stringify(result).includes('private-'), false);
  assert.deepEqual(clients[0].state.cookieInput, []);
});

test('first-login Auth gateway uses current_password, global sign-out, and fresh session cookies only', async () => {
  const { factory, clients } = factoryFixture();
  const gateway = createSupabaseAuthGateway([{ name: 'sb-auth.0', value: 'restricted-cookie' }], factory);
  const current = await gateway.verifyCurrentSession();
  assert.deepEqual(current, { identity: { userId, sessionId: oldSession, verified: true }, email: 'owner@example.invalid' });
  assert.equal(await gateway.changePassword('synthetic-temp-password', 'synthetic-new-password'), 'confirmed');
  assert.deepEqual(clients[0].state.updates, [{ password: 'synthetic-new-password', current_password: 'synthetic-temp-password' }]);
  assert.equal(await gateway.signOutGlobally(), 'confirmed');
  assert.deepEqual(clients[0].state.signouts, [{ scope: 'global' }]);
  const fresh = await gateway.signInFresh('owner@example.invalid', 'synthetic-new-password');
  assert.equal(fresh.identity.sessionId, freshSession);
  assert.deepEqual(clients[1].state.cookieInput, []);
});

test('staff sign-out buffers global session cookie deletions for the server response', async () => {
  const { factory, clients } = factoryFixture();
  const gateway = createSupabaseAuthGateway([{ name: 'sb-auth.0', value: 'admitted-cookie' }], factory);
  const result = await gateway.signOutCurrent();
  assert.equal(result.confirmed, true);
  assert.deepEqual(result.cookies.map(({ name, value, options }) => ({ name, value, options })), [
    { name: 'sb-auth.0', value: '', options: { path: '/', maxAge: 0 } },
  ]);
  assert.deepEqual(clients[0].state.signouts, [{ scope: 'global' }]);
});
