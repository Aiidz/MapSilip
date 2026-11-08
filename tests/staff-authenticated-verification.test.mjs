import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertSyntheticEmail,
  getAccessTokenFromCookies,
  mergeSetCookieHeaders,
  runAuthenticatedStaffVerification,
  summarizeCheck,
} from '../scripts/lib/staff-authenticated-verification.mjs';

const projectRef = 'atuqxpiandeutimdkgag';
const encode = value => `base64-${Buffer.from(JSON.stringify(value)).toString('base64url')}`;

test('hosted runner accepts only synthetic .invalid identities', () => {
  assert.equal(assertSyntheticEmail('owner@example.invalid'), 'owner@example.invalid');
  assert.throws(() => assertSyntheticEmail('owner@example.com'));
  assert.throws(() => assertSyntheticEmail('owner@example.invalid.evil'));
});

test('session decoder joins ordered SSR cookie chunks without exposing token values', () => {
  const encoded = encode({ access_token: 'synthetic-access-token', refresh_token: 'synthetic-refresh-token' });
  const split = Math.floor(encoded.length / 2);
  const cookies = new Map([
    [`sb-${projectRef}-auth-token.1`, encodeURIComponent(encoded.slice(split))],
    [`sb-${projectRef}-auth-token.0`, encodeURIComponent(encoded.slice(0, split))],
  ]);
  assert.equal(getAccessTokenFromCookies(cookies, projectRef), 'synthetic-access-token');
});

test('cookie updates replace and delete chunks as directed by Set-Cookie headers', () => {
  const cookies = new Map([['sb-ref-auth-token.0', 'stale'], ['keep', 'value']]);
  mergeSetCookieHeaders(cookies, [
    'sb-ref-auth-token=base64-new; Path=/; HttpOnly',
    'sb-ref-auth-token.0=; Path=/; Max-Age=0',
  ]);
  assert.deepEqual([...cookies.entries()], [['keep', 'value'], ['sb-ref-auth-token', 'base64-new']]);
});

test('runner summaries contain outcome metadata only', () => {
  const result = summarizeCheck('owner_finance_read', true, 200);
  assert.deepEqual(result, { name: 'owner_finance_read', passed: true, status: 200 });
  assert.equal(JSON.stringify(result).includes('synthetic-access-token'), false);
});

test('authenticated hosted runner refuses a different project before any network request', async t => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; return new Response(null, { status: 200 }); };
  t.after(() => { globalThis.fetch = originalFetch; });
  await assert.rejects(runAuthenticatedStaffVerification({
    projectUrl: 'https://other-project.supabase.co', publishableKey: 'sb_publishable_offline_test',
    appOrigin: 'http://localhost:3000', identities: [
      { role: 'owner', email: 'owner@example.invalid', currentPassword: 'synthetic-current-password', replacementPassword: 'synthetic-new-password' },
      { role: 'caretaker', email: 'caretaker@example.invalid', currentPassword: 'synthetic-current-password', replacementPassword: 'synthetic-new-password' },
    ],
  }), /unexpected project/);
  assert.equal(requests, 0);
});
