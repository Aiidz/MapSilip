import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const output = mkdtempSync(join(tmpdir(), 'mapsilip-auth-service-'));
after(() => rmSync(output, { recursive: true, force: true }));
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'),
  'app/lib/backend/auth/protocol.ts', 'app/lib/backend/auth/service.ts', 'app/lib/backend/security.ts',
  '--rootDir', 'app/lib', '--outDir', output, '--module', 'commonjs', '--target', 'ES2020',
  '--strict', '--skipLibCheck', '--types', 'node'], { stdio: 'pipe' });
const { staffSignIn, completeFirstLogin, staffSignOut } = require(join(output, 'backend/auth/service.js'));
const { BackendError, publicBackendError } = require(join(output, 'backend/security.js'));
const userId = '00000000-0000-4000-8000-000000000011';
const oldSession = '00000000-0000-4000-8000-000000000012';
const newSession = '00000000-0000-4000-8000-000000000013';
const revision = '4';
const account = { userId, role: 'owner', status: 'active', passwordChangeRequired: false, securityRevision: revision };
const attempt = (kind = 'staff_signin') => ({ id: '00000000-0000-4000-8000-000000000014', kind, userId,
  expectedRevision: revision, startingSessionId: kind === 'staff_password_change' ? oldSession : null,
  expiresAt: 2000, consumedAt: null });
const identity = sessionId => ({ userId, sessionId, verified: true });

function signInDeps(overrides = {}) {
  const calls = [];
  const deps = {
    consumeRateLimit: async () => { calls.push('rate'); return true; },
    beginStaffSignin: async () => { calls.push('begin'); return { attempt: attempt(), account }; },
    auth: { signIn: async () => { calls.push('auth'); return { identity: identity(newSession), cookies: [{ name: 'sb-session', value: 'token-only-in-memory', options: {} }] }; } },
    finishStaffSignin: async () => { calls.push('finish'); return { result: 'admitted', role: 'owner', userId, sessionId: newSession, securityRevision: revision }; },
    now: () => 1000,
    ...overrides,
  };
  return { deps, calls };
}

test('staff sign-in rate limits first, verifies Auth identity, then admits before returning cookies', async () => {
  const { deps, calls } = signInDeps();
  const result = await staffSignIn(deps, { email: 'Owner@example.invalid', password: 'synthetic-temp-password', clientAddress: '192.0.2.1' });
  assert.deepEqual(calls, ['rate', 'begin', 'auth', 'finish']);
  assert.equal(result.kind, 'admitted');
  assert.equal(result.destination, '/management');
  assert.deepEqual(result.cookies.map(cookie => cookie.name), ['sb-session']);
  assert.equal(JSON.stringify({ ...result, cookies: undefined }).includes('synthetic-temp-password'), false);
});

test('a database-mapped caretaker is routed to the caretaker dashboard', async () => {
  const caretakerAccount = { ...account, role: 'caretaker' };
  const { deps } = signInDeps({ beginStaffSignin: async () => ({ attempt: attempt(), account: caretakerAccount }),
    finishStaffSignin: async () => ({ result: 'admitted', role: 'caretaker', userId, sessionId: newSession,
      securityRevision: revision }) });
  const result = await staffSignIn(deps,
    { email: 'caretaker@example.invalid', password: 'synthetic-temp-password', clientAddress: '192.0.2.1' });
  assert.equal(result.destination, '/caretaker');
});

test('staff sign-out revokes the current database admission before global Auth sign-out', async () => {
  const calls = [];
  const result = await staffSignOut({
    auth: {
      verifyCurrentSession: async () => { calls.push('verify'); return { identity: identity(newSession), email: 'owner@example.invalid' }; },
      signOutCurrent: async () => { calls.push('global-signout'); return { confirmed: true,
        cookies: [{ name: 'sb-session', value: '', options: { maxAge: 0 } }] }; },
    },
    revokeSessionAdmission: async (receivedUser, receivedSession) => {
      calls.push('revoke'); assert.deepEqual([receivedUser, receivedSession], [userId, newSession]); return true;
    },
  });
  assert.deepEqual(calls, ['verify', 'revoke', 'global-signout']);
  assert.deepEqual(result.cookies.map(cookie => cookie.name), ['sb-session']);
});

test('staff sign-out fails closed if admission revocation or Auth global sign-out is uncertain', async () => {
  const auth = {
    verifyCurrentSession: async () => ({ identity: identity(newSession), email: 'owner@example.invalid' }),
    signOutCurrent: async () => ({ confirmed: false, cookies: [] }),
  };
  await assert.rejects(staffSignOut({ auth, revokeSessionAdmission: async () => { throw new Error('database unavailable'); } }),
    error => publicBackendError(error).status === 503);
  await assert.rejects(staffSignOut({ auth, revokeSessionAdmission: async () => true }),
    error => publicBackendError(error).status === 503);
});

test('credential failures deny staff sign-in while unmapped identities are handed to tenant resolution before Auth', async () => {
  const badCredentials = signInDeps({ auth: { signIn: async () => { throw new BackendError('unauthenticated'); } } });
  await assert.rejects(staffSignIn(badCredentials.deps,
    { email: 'owner@example.invalid', password: 'wrong-password', clientAddress: '192.0.2.1' }),
  error => publicBackendError(error).status === 401);

  const calls = [];
  const unmapped = signInDeps({ beginStaffSignin: async () => { calls.push('lookup'); return null; },
    auth: { signIn: async () => { calls.push('auth'); throw new Error('must not run'); } } });
  assert.deepEqual(await staffSignIn(unmapped.deps,
    { email: 'tenant@example.invalid', password: 'tenant-password', clientAddress: '192.0.2.1' }), { kind: 'unmapped' });
  assert.deepEqual(calls, ['lookup']);
});

test('rate limiter outage fails closed before account lookup or Auth', async () => {
  const { deps, calls } = signInDeps({ consumeRateLimit: async () => { calls.push('rate'); throw new Error('private detail'); } });
  await assert.rejects(staffSignIn(deps, { email: 'owner@example.invalid', password: 'synthetic-temp-password', clientAddress: '192.0.2.1' }),
    error => publicBackendError(error).status === 503 && !error.message.includes('private detail'));
  assert.deepEqual(calls, ['rate']);
});

test('a rate-limit denial is tagged with its safe diagnostic stage', async () => {
  const { deps } = signInDeps({ consumeRateLimit: async () => false });
  await assert.rejects(staffSignIn(deps,
    { email: 'owner@example.invalid', password: 'synthetic-temp-password', clientAddress: '192.0.2.1' }),
  error => error.stage === 'rate_limit' && publicBackendError(error).code === 'rate_limited' && publicBackendError(error).status === 429);
});

test('sign-in denies on stale DB result and never returns an Auth cookie', async () => {
  const { deps } = signInDeps({ finishStaffSignin: async () => null });
  await assert.rejects(staffSignIn(deps, { email: 'owner@example.invalid', password: 'synthetic-temp-password', clientAddress: '192.0.2.1' }),
    error => publicBackendError(error).status === 403 && error.stage === 'staff_admission');
});

test('a security revision race between sign-in snapshot and admission keeps the Auth cookie private', async () => {
  let currentRevision = revision;
  const { deps, calls } = signInDeps({ finishStaffSignin: async () => {
    currentRevision = '5'; // The database command observed the intervening deactivation/reissue.
    calls.push('finish-denied'); return null;
  } });
  await assert.rejects(staffSignIn(deps, { email: 'owner@example.invalid', password: 'synthetic', clientAddress: '192.0.2.1' }),
    error => publicBackendError(error).status === 403);
  assert.equal(currentRevision, '5');
  assert.equal(calls.includes('finish-denied'), true);
});

test('sign-in does not trust a mismatched returned role or captured revision', async () => {
  for (const change of [{ role: 'caretaker' }, { securityRevision: '5' }]) {
    const { deps } = signInDeps({ finishStaffSignin: async () => ({ result: 'admitted', role: 'owner', userId, sessionId: newSession,
      securityRevision: revision, ...change }) });
    await assert.rejects(staffSignIn(deps, { email: 'owner@example.invalid', password: 'synthetic', clientAddress: '192.0.2.1' }),
      error => publicBackendError(error).status === 403);
  }
});

function completionDeps(overrides = {}) {
  const calls = [];
  const deps = {
    consumeRateLimit: async () => { calls.push('rate'); return true; },
    auth: {
      verifyCurrentSession: async () => ({ identity: identity(oldSession), email: 'owner@example.invalid' }),
      changePassword: async () => { calls.push('update'); return 'confirmed'; },
      signOutGlobally: async () => { calls.push('signout'); return 'confirmed'; },
      signInFresh: async () => { calls.push('fresh'); return { identity: identity(newSession), cookies: [{ name: 'sb', value: 'fresh-cookie', options: {} }] }; },
    },
    beginFirstLoginChange: async () => { calls.push('begin'); return { attempt: attempt('staff_password_change'), account: { ...account, passwordChangeRequired: true } }; },
    hasOnlyAuthSession: async () => { calls.push('sessions'); return true; },
    liveSessionIds: async () => [newSession],
    completeFirstLogin: async (...args) => { calls.push('complete'); assert.deepEqual(args.slice(1), [userId, newSession, true, true]); return { result: 'completed', role: 'owner', userId, sessionId: newSession, securityRevision: '5' }; },
    reconcileFirstLogin: async () => null,
    now: () => 1000,
    ...overrides,
  };
  return { deps, calls };
}

test('first-login completion revokes, reauthenticates to a different session, commits, then exposes only fresh cookies', async () => {
  const { deps, calls } = completionDeps();
  const result = await completeFirstLogin(deps, { currentPassword: 'synthetic-temp-password', newPassword: 'newpass8', clientAddress: '192.0.2.1' });
  assert.deepEqual(calls, ['rate', 'begin', 'update', 'signout', 'fresh', 'sessions', 'complete']);
  assert.equal(result.kind, 'completed');
  assert.equal(result.destination, '/management');
  assert.deepEqual(result.cookies.map(cookie => cookie.value), ['fresh-cookie']);
});

test('successful first-login change, sign-out, and subsequent sign-in admit the updated owner account', async () => {
  const postLogoutSession = '00000000-0000-4000-8000-000000000015';
  const calls = [];
  let accountState = { ...account, passwordChangeRequired: true };
  let currentSession = oldSession;
  const deps = {
    consumeRateLimit: async () => { calls.push('rate-limit'); return true; },
    beginFirstLoginChange: async () => ({ attempt: attempt('staff_password_change'), account: accountState }),
    hasOnlyAuthSession: async (_user, session) => session === newSession,
    completeFirstLogin: async (_attempt, user, session) => {
      accountState = { ...accountState, passwordChangeRequired: false, securityRevision: '5' };
      currentSession = session;
      return { result: 'completed', role: 'owner', userId: user, sessionId: session, securityRevision: '5' };
    },
    reconcileFirstLogin: async () => null,
    revokeSessionAdmission: async (_user, session) => { calls.push('revoke-admission'); return session === currentSession; },
    beginStaffSignin: async () => ({ attempt: { ...attempt(), expectedRevision: accountState.securityRevision }, account: accountState }),
    finishStaffSignin: async (_attempt, user, session) => ({ result: 'admitted', role: accountState.role,
      userId: user, sessionId: session, securityRevision: accountState.securityRevision }),
    auth: {
      verifyCurrentSession: async () => ({ identity: identity(currentSession), email: 'owner@example.invalid' }),
      changePassword: async () => { calls.push('password-update'); return 'confirmed'; },
      signOutGlobally: async () => { calls.push('global-signout'); return 'confirmed'; },
      signInFresh: async () => { calls.push('fresh-signin'); return { identity: identity(newSession), cookies: [{ name: 'fresh', value: 'fresh', options: {} }] }; },
      signOutCurrent: async () => { calls.push('current-signout'); return { confirmed: true, cookies: [] }; },
      signIn: async (_email, password) => {
        calls.push('subsequent-signin'); assert.equal(password, 'synthetic-updated-password');
        return { identity: identity(postLogoutSession), cookies: [{ name: 'admitted', value: 'admitted', options: {} }] };
      },
    },
    now: () => 1000,
  };

  const completed = await completeFirstLogin(deps,
    { currentPassword: 'synthetic-temporary-password', newPassword: 'synthetic-updated-password', clientAddress: '192.0.2.1' });
  assert.equal(completed.kind, 'completed');
  assert.equal(accountState.passwordChangeRequired, false);
  const signedOut = await staffSignOut(deps);
  assert.equal(signedOut.kind, 'signed-out');
  const signedIn = await staffSignIn(deps,
    { email: 'owner@example.invalid', password: 'synthetic-updated-password', clientAddress: '192.0.2.1' });
  assert.equal(signedIn.kind, 'admitted');
  assert.equal(signedIn.destination, '/management');
  assert.deepEqual(calls, ['rate-limit', 'password-update', 'global-signout', 'fresh-signin', 'revoke-admission',
    'current-signout', 'rate-limit', 'subsequent-signin']);
});

test('uncertain Auth or DB completion never clears restriction or returns fresh cookies', async () => {
  for (const overrides of [
    { auth: { verifyCurrentSession: async () => ({ identity: identity(oldSession), email: 'owner@example.invalid' }),
      changePassword: async () => 'uncertain', signOutGlobally: async () => 'uncertain', signInFresh: async () => assert.fail('must not sign in') } },
    { auth: { verifyCurrentSession: async () => ({ identity: identity(oldSession), email: 'owner@example.invalid' }),
      changePassword: async () => 'confirmed', signOutGlobally: async () => 'uncertain', signInFresh: async () => assert.fail('must not sign in') } },
    { completeFirstLogin: async () => { throw new Error('commit uncertain'); }, reconcileFirstLogin: async () => null },
  ]) {
    const { deps } = completionDeps(overrides);
    await assert.rejects(completeFirstLogin(deps, { currentPassword: 'synthetic-temp-password', newPassword: 'synthetic-new-password', clientAddress: '192.0.2.1' }),
      error => publicBackendError(error).status === 503);
  }
});

test('a rejected Auth password update is tagged at that stage and never clears first-login restriction', async () => {
  const { deps, calls } = completionDeps({
    auth: { verifyCurrentSession: async () => ({ identity: identity(oldSession), email: 'owner@example.invalid' }),
      changePassword: async () => { calls.push('update-rejected'); return 'rejected'; },
      signOutGlobally: async () => assert.fail('must not globally sign out'),
      signInFresh: async () => assert.fail('must not create a fresh session') },
    completeFirstLogin: async () => assert.fail('must not clear restriction'),
  });
  await assert.rejects(completeFirstLogin(deps,
    { currentPassword: 'temporary', newPassword: 'replacement-password', clientAddress: '192.0.2.1' }),
  error => error.stage === 'first_login_password_update' && publicBackendError(error).code === 'invalid_input');
  assert.deepEqual(calls, ['rate', 'begin', 'update-rejected']);
});

test('first-login password shorter than the application minimum is rejected before session or Auth work', async () => {
  const { deps, calls } = completionDeps();
  await assert.rejects(completeFirstLogin(deps,
    { currentPassword: 'temporary', newPassword: 'short77', clientAddress: '192.0.2.1' }),
  error => error.stage === 'first_login_input' && publicBackendError(error).code === 'invalid_input');
  assert.deepEqual(calls, []);
});

test('invalid or stale password-change ticket is rejected before changing Auth credentials', async () => {
  let changed = false;
  const { deps } = completionDeps({
    beginFirstLoginChange: async () => ({ attempt: { ...attempt('staff_password_change'), expectedRevision: '3' },
      account: { ...account, passwordChangeRequired: true } }),
    auth: { verifyCurrentSession: async () => ({ identity: identity(oldSession), email: 'owner@example.invalid' }),
      changePassword: async () => { changed = true; return 'confirmed'; },
      signOutGlobally: async () => 'confirmed', signInFresh: async () => assert.fail('must not sign in') },
  });
  await assert.rejects(completeFirstLogin(deps, { currentPassword: 'temporary', newPassword: 'replacement-password', clientAddress: '192.0.2.1' }),
    error => publicBackendError(error).status === 403);
  assert.equal(changed, false);
});

test('first-login rate limiter denial or outage stops before Auth password update', async () => {
  for (const [limiter, expectedStatus, expectedCode] of [
    [async () => false, 429, 'rate_limited'],
    [async () => { throw new Error('private'); }, 503, 'unavailable'],
  ]) {
    let changed = false;
    const { deps } = completionDeps({ consumeRateLimit: limiter,
      auth: { verifyCurrentSession: async () => ({ identity: identity(oldSession), email: 'owner@example.invalid' }),
        changePassword: async () => { changed = true; return 'confirmed'; },
        signOutGlobally: async () => 'confirmed', signInFresh: async () => assert.fail('must not sign in') },
    });
    await assert.rejects(completeFirstLogin(deps,
      { currentPassword: 'temporary', newPassword: 'replacement-password', clientAddress: '192.0.2.1' }), error =>
      publicBackendError(error).status === expectedStatus && publicBackendError(error).code === expectedCode);
    assert.equal(changed, false);
  }
});

test('deactivation or reissue during Auth calls prevents first-login completion and exposes no fresh cookie', async () => {
  for (const mutation of ['deactivate', 'reissue']) {
    let currentRevision = revision;
    const { deps } = completionDeps({
      auth: { verifyCurrentSession: async () => ({ identity: identity(oldSession), email: 'owner@example.invalid' }),
        changePassword: async () => { currentRevision = '5'; return 'confirmed'; },
        signOutGlobally: async () => 'confirmed',
        signInFresh: async () => ({ identity: identity(newSession), cookies: [{ name: 'sb', value: 'must-not-return', options: {} }] }) },
      completeFirstLogin: async () => {
        assert.equal(currentRevision, '5', `${mutation} raced ahead of commit`);
        return null;
      },
    });
    await assert.rejects(completeFirstLogin(deps, { currentPassword: 'temporary', newPassword: 'replacement-password', clientAddress: '192.0.2.1' }),
      error => publicBackendError(error).status === 403);
  }
});

test('completion replay requires the same admitted session and does not repeat credentials', async () => {
  const { deps, calls } = completionDeps({
    completeFirstLogin: async () => { throw new Error('connection lost after commit'); },
    reconcileFirstLogin: async () => ({ result: 'completed', role: 'owner', userId, sessionId: newSession, securityRevision: '5' }),
  });
  const result = await completeFirstLogin(deps, { currentPassword: 'synthetic-temp-password', newPassword: 'synthetic-new-password', clientAddress: '192.0.2.1' });
  assert.equal(result.kind, 'completed');
  assert.equal(calls.filter(call => call === 'update').length, 1);
  assert.equal(calls.filter(call => call === 'fresh').length, 1);
});
