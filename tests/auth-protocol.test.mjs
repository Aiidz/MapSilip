import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const output = mkdtempSync(join(tmpdir(), 'mapsilip-auth-protocol-'));
after(() => rmSync(output, { recursive: true, force: true }));
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'),
  'app/lib/backend/auth/protocol.ts', '--rootDir', 'app/lib', '--outDir', output,
  '--module', 'commonjs', '--target', 'ES2020', '--strict', '--skipLibCheck', '--types', 'node'], { stdio: 'pipe' });
const { canBeginFirstLoginChange, decideSignIn, decideFirstLoginCompletion, reconcileCompletion } = require(join(output, 'backend/auth/protocol.js'));

const userId = '00000000-0000-4000-8000-000000000001';
const oldSession = '00000000-0000-4000-8000-000000000002';
const newSession = '00000000-0000-4000-8000-000000000003';
const baseAttempt = () => ({ id: '00000000-0000-4000-8000-000000000004', kind: 'staff_signin', userId,
  expectedRevision: '9', startingSessionId: null, expiresAt: 1000, consumedAt: null });
const baseAccount = () => ({ userId, role: 'owner', status: 'active',
  passwordChangeRequired: false, securityRevision: '9' });

test('sign-in admission requires an unexpired server attempt and verified matching subject/session', () => {
  const attempt = baseAttempt();
  const decision = decideSignIn({ attempt, account: baseAccount(),
    verifiedIdentity: { userId, sessionId: newSession, verified: true }, now: 999 });
  assert.deepEqual(decision, { kind: 'admit', userId, sessionId: newSession, revision: '9' });
  assert.equal(decideSignIn({ attempt, account: baseAccount(),
    verifiedIdentity: { userId: 'another-user', sessionId: newSession, verified: true }, now: 999 }).kind, 'deny');
});

test('first-login sign-in yields restricted access without session admission', () => {
  const account = { ...baseAccount(), passwordChangeRequired: true };
  assert.deepEqual(decideSignIn({ attempt: baseAttempt(), account,
    verifiedIdentity: { userId, sessionId: newSession, verified: true }, now: 999 }),
  { kind: 'restricted', userId, sessionId: newSession, revision: '9' });
});

test('sign-in denies missing, inactive, stale, expired, consumed and unverified attempts', () => {
  const attempt = baseAttempt();
  const identity = { userId, sessionId: newSession, verified: true };
  const invalid = [
    { attempt: null, account: baseAccount(), verifiedIdentity: identity, now: 0 },
    { attempt, account: null, verifiedIdentity: identity, now: 0 },
    { attempt, account: { ...baseAccount(), status: 'deactivated' }, verifiedIdentity: identity, now: 0 },
    { attempt, account: { ...baseAccount(), securityRevision: '10' }, verifiedIdentity: identity, now: 0 },
    { attempt: { ...attempt, expiresAt: 1 }, account: baseAccount(), verifiedIdentity: identity, now: 1 },
    { attempt: { ...attempt, consumedAt: 500 }, account: baseAccount(), verifiedIdentity: identity, now: 0 },
    { attempt, account: baseAccount(), verifiedIdentity: { ...identity, verified: false }, now: 0 },
  ];
  for (const context of invalid) assert.deepEqual(decideSignIn(context), { kind: 'deny' });
});

const completionContext = overrides => ({
  attempt: { ...baseAttempt(), kind: 'staff_password_change', startingSessionId: oldSession },
  account: { ...baseAccount(), passwordChangeRequired: true },
  verifiedIdentity: { userId, sessionId: newSession, verified: true },
  now: 999,
  passwordUpdate: 'confirmed',
  globalRevocation: 'confirmed',
  liveSessionIds: [newSession],
  ...overrides,
});

test('trusted first-login completion admits only a fresh verified session at the next revision', () => {
  assert.deepEqual(decideFirstLoginCompletion(completionContext()), {
    kind: 'complete', userId, sessionId: newSession, previousRevision: '9', newRevision: '10',
  });
});

test('password replacement starts only for the exact active restricted account, revision and session', () => {
  const valid = { attempt: { ...baseAttempt(), kind: 'staff_password_change', startingSessionId: oldSession },
    account: { ...baseAccount(), passwordChangeRequired: true }, identity: { userId, sessionId: oldSession, verified: true }, now: 999 };
  assert.equal(canBeginFirstLoginChange(valid), true);
  for (const bad of [
    { ...valid, account: { ...valid.account, status: 'deactivated' } },
    { ...valid, account: { ...valid.account, passwordChangeRequired: false } },
    { ...valid, attempt: { ...valid.attempt, expectedRevision: '8' } },
    { ...valid, attempt: { ...valid.attempt, startingSessionId: newSession } },
    { ...valid, identity: { ...valid.identity, sessionId: newSession } },
    { ...valid, attempt: { ...valid.attempt, expiresAt: 999 } },
  ]) assert.equal(canBeginFirstLoginChange(bad), false);
});

test('first-login completion fails closed for stale, forged, replayed, expired or uncertain attempts', () => {
  const cases = [
    { attempt: null },
    { verifiedIdentity: { userId, sessionId: oldSession } },
    { verifiedIdentity: { userId: 'forged', sessionId: newSession } },
    { account: { ...baseAccount(), status: 'deactivated', passwordChangeRequired: true } },
    { account: { ...baseAccount(), passwordChangeRequired: false } },
    { account: { ...baseAccount(), securityRevision: '10', passwordChangeRequired: true } },
    { attempt: { ...completionContext().attempt, expiresAt: 1 } },
    { attempt: { ...completionContext().attempt, consumedAt: 900 } },
    { passwordUpdate: 'uncertain' },
    { globalRevocation: 'uncertain' },
    { liveSessionIds: [oldSession, newSession] },
    { liveSessionIds: [] },
    { liveSessionIds: [newSession, 'not-a-uuid'] },
  ];
  for (const change of cases) assert.deepEqual(decideFirstLoginCompletion(completionContext(change)), { kind: 'deny' });
});

test('completed attempts reconcile only for their exact currently admitted fresh session and revision', () => {
  const receipt = { userId, sessionId: newSession, revision: '10' };
  const context = { attempt: { ...completionContext().attempt, consumedAt: 999, receipt },
    account: { ...baseAccount(), passwordChangeRequired: false, securityRevision: '10' },
    verifiedIdentity: { userId, sessionId: newSession, verified: true }, currentAdmission: { sessionId: newSession, revision: '10' } };
  assert.deepEqual(reconcileCompletion(context), { kind: 'confirmed', ...receipt });
  assert.deepEqual(reconcileCompletion({ ...context, verifiedIdentity: { userId, sessionId: oldSession, verified: true } }), { kind: 'deny' });
  assert.deepEqual(reconcileCompletion({ ...context, account: { ...context.account, status: 'deactivated' } }), { kind: 'deny' });
  assert.deepEqual(reconcileCompletion({ ...context, currentAdmission: { sessionId: newSession, revision: '9' } }), { kind: 'deny' });
});
