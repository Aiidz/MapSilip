import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';

// SDK transport characterization only. No environment loading or real HTTP.
// Every request terminates in this injected fetch; unexpected requests fail.
const origin = 'https://mapsilip-sdk-test.invalid';
const user = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated', role: 'authenticated', email: 'staff@example.invalid',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00.000Z',
};
let instance = 0;

function harness({ updateError, logoutError } = {}) {
  const requests = [];
  const events = [];
  const client = createClient(origin, 'sb_publishable_OfflineFixtureOnly', {
    auth: {
      storageKey: `mapsilip-offline-sdk-${instance++}`,
      autoRefreshToken: false, persistSession: false, detectSessionInUrl: false,
    },
    global: {
      fetch: async (input, options) => {
        const url = new URL(input);
        assert.equal(url.origin, origin, 'Only the synthetic origin is allowed');
        const request = { path: url.pathname, method: options.method, body: options.body ? JSON.parse(options.body) : null };
        requests.push(request);
        if (request.path === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password' && request.method === 'POST') {
          return Response.json({
            access_token: 'offline-access-token', refresh_token: 'offline-refresh-token',
            token_type: 'bearer', expires_in: 3600, user,
          });
        }
        if (request.path === '/auth/v1/user' && request.method === 'PUT') {
          return updateError ? Response.json({ code: updateError.code, msg: 'Synthetic rejection' }, {
            status: updateError.status, headers: { 'X-Supabase-Api-Version': '2024-01-01' },
          }) : Response.json(user);
        }
        if (request.path === '/auth/v1/logout' && request.method === 'POST') {
          return logoutError ? Response.json({ code: 'bad_jwt', msg: 'Synthetic revocation rejection' }, { status: logoutError }) : new Response(null, { status: 204 });
        }
        assert.fail('Unexpected request in offline Auth harness');
      },
    },
  });
  const { data: { subscription } } = client.auth.onAuthStateChange(event => events.push(event));
  return {
    client, requests, events,
    async establishSyntheticSession() {
      const result = await client.auth.signInWithPassword({ email: user.email, password: 'synthetic-temporary-password' });
      assert.equal(result.error, null);
    },
    close() { subscription.unsubscribe(); },
  };
}

test('offline SDK forwards the documented current_password field on authenticated password update', async t => {
  const fixture = harness(); t.after(() => fixture.close());
  await fixture.establishSyntheticSession();
  const { error } = await fixture.client.auth.updateUser({
    password: 'synthetic-replacement-password', current_password: 'synthetic-temporary-password', nonce: 'synthetic-nonce',
  });
  assert.equal(error, null);
  const updates = fixture.requests.filter(request => request.path === '/auth/v1/user');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].method, 'PUT');
  assert.equal(updates[0].body.password, 'synthetic-replacement-password');
  assert.equal(updates[0].body.current_password, 'synthetic-temporary-password');
  assert.equal(updates[0].body.nonce, 'synthetic-nonce');
  assert.ok(fixture.events.includes('USER_UPDATED'));
});

test('offline SDK rejects a password update without a session before making a request', async t => {
  const fixture = harness(); t.after(() => fixture.close());
  const { error } = await fixture.client.auth.updateUser({ password: 'synthetic-replacement-password', current_password: 'synthetic-temporary-password' });
  assert.equal(error?.name, 'AuthSessionMissingError');
  assert.equal(fixture.requests.length, 0);
});

test('offline SDK preserves password-policy errors and emits no password-update event on rejection', async t => {
  for (const code of ['invalid_credentials', 'same_password', 'weak_password', 'reauthentication_needed']) {
    const fixture = harness({ updateError: { code, status: 422 } }); t.after(() => fixture.close());
    await fixture.establishSyntheticSession();
    const { data, error } = await fixture.client.auth.updateUser({ password: 'synthetic-password', current_password: 'synthetic-current-password' });
    assert.equal(error?.code, code);
    assert.equal(data.user, null);
    assert.equal(fixture.events.includes('USER_UPDATED'), false);
  }
});

test('offline SDK returns a password-update service error without a success event or automatic replay', async t => {
  const fixture = harness({ updateError: { code: 'unexpected_failure', status: 503 } }); t.after(() => fixture.close());
  await fixture.establishSyntheticSession();
  const { data, error } = await fixture.client.auth.updateUser({ password: 'synthetic-password', current_password: 'synthetic-current-password' });
  assert.equal(error?.status, 503);
  assert.equal(data.user, null);
  assert.equal(fixture.events.includes('USER_UPDATED'), false);
  assert.equal(fixture.requests.filter(request => request.path === '/auth/v1/user').length, 1);
});

test('offline SDK signOut can return success after a 401 response, so it cannot prove remote revocation', async t => {
  const fixture = harness({ logoutError: 401 }); t.after(() => fixture.close());
  await fixture.establishSyntheticSession();
  const { error } = await fixture.client.auth.signOut({ scope: 'global' });
  assert.equal(error, null);
  const { data } = await fixture.client.auth.getSession();
  assert.equal(data.session, null);
  assert.equal(fixture.requests.filter(request => request.path === '/auth/v1/logout').length, 1);
});

test('offline SDK returns a revocation service error and retains its local session', async t => {
  const fixture = harness({ logoutError: 503 }); t.after(() => fixture.close());
  await fixture.establishSyntheticSession();
  const { error } = await fixture.client.auth.signOut({ scope: 'global' });
  assert.equal(error?.status, 503);
  const { data } = await fixture.client.auth.getSession();
  assert.ok(data.session);
});
