import assert from 'node:assert/strict';
import test from 'node:test';
import { startDriveConsent, finishDriveConsent, sealDriveToken, openDriveToken } from '../worker/backup/oauth.mjs';

const config = { clientId: 'fixture-client', clientSecret: 'fixture-secret', redirectUri: 'https://fixture.example/api/backups/drive/callback' };
const owner = { userId: 'owner', sessionId: 'session' };

test('OAuth binds consent to one owner session and consumes the state once', async () => {
  const challenges = new Map();
  const store = {
    async put(key, state) { challenges.set(key, state); },
    async consume(key, context, now) {
      const state = challenges.get(key);
      if (!state || state.expiresAt <= now || state.userId !== context.userId || state.sessionId !== context.sessionId ||
          state.redirectUri !== context.redirectUri) return null;
      challenges.delete(key);
      return state;
    },
  };
  const url = new URL(await startDriveConsent(config, owner, store, 100));
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  const state = url.searchParams.get('state');
  const fetcher = async (url, options) => {
    if (url.endsWith('/token')) {
      assert.ok(options.body.get('code_verifier'));
      return Response.json({ access_token: 'access', refresh_token: 'refresh',
        scope: 'https://www.googleapis.com/auth/drive.file' });
    }
    return Response.json({ user: { permissionId: 'stable-owner-id' } });
  };
  const input = { state, code: 'code' };
  await assert.rejects(finishDriveConsent(config, { ...owner, sessionId: 'wrong' }, store, input, fetcher, 101), /state/);
  assert.deepEqual(await finishDriveConsent(config, owner, store, input, fetcher, 101),
    { accountId: 'stable-owner-id', refreshToken: 'refresh' });
  await assert.rejects(finishDriveConsent(config, owner, store, input, fetcher, 102), /state/);
});

test('token envelope binds ciphertext to the connection and uses a fresh key', async () => {
  const kms = { async wrap(key) { return Buffer.from(key).toString('base64'); },
    async unwrap(wrapped) { return Buffer.from(wrapped, 'base64'); } };
  const first = await sealDriveToken('private-refresh-token', 'connection', 'key-v1', kms);
  const second = await sealDriveToken('private-refresh-token', 'connection', 'key-v1', kms);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.equal(await openDriveToken(first, 'connection', kms), 'private-refresh-token');
  await assert.rejects(openDriveToken(first, 'different-connection', kms));
  assert.ok(!JSON.stringify(first).includes('private-refresh-token'));
});

test('Vercel federation exchanges an assertion for short-lived KMS impersonation', async () => {
  const { exchangeVercelIdentity } = await import('../worker/backup/workload-identity.mjs');
  const audience = '//iam.googleapis.com/projects/123/locations/global/workloadIdentityPools/test/providers/vercel';
  const config = { assertion: 'fixture-oidc', audience, serviceAccount: 'backup@test-project.iam.gserviceaccount.com' };
  let calls = 0;
  const token = await exchangeVercelIdentity(config, async (url, request) => {
    calls++;
    if (url === 'https://sts.googleapis.com/v1/token') {
      assert.equal(request.body.get('subject_token'), config.assertion);
      assert.equal(request.body.get('audience'), audience);
      return Response.json({ access_token: 'federated-fixture' });
    }
    assert.equal(new URL(url).origin, 'https://iamcredentials.googleapis.com');
    assert.equal(request.headers.Authorization, 'Bearer federated-fixture');
    assert.equal(JSON.parse(request.body).lifetime, '600s');
    return Response.json({ accessToken: 'kms-fixture' });
  });
  assert.equal(token, 'kms-fixture');
  assert.equal(calls, 2);
  await assert.rejects(exchangeVercelIdentity({ ...config, audience: 'https://other.example' }), /configured/);
});

test('local token wrapping works across runtimes and rejects wrong secrets, owner bindings and tampering', async () => {
  const { withLocalWrappingKey, localKeyId } = await import('../worker/backup/local-key.mjs');
  const { sealDriveToken, openDriveToken } = await import('../worker/backup/oauth.mjs');
  const env = { BACKUP_LOCAL_WRAPPING_KEY: 'a1'.repeat(32) };
  const sender = withLocalWrappingKey({}, env);
  const receiver = withLocalWrappingKey({}, { ...env });
  const seal = await sealDriveToken('fixture-token', 'owner-a', localKeyId, sender);
  assert.equal(await openDriveToken(seal, 'owner-a', receiver), 'fixture-token');
  await assert.rejects(openDriveToken(seal, 'owner-b', receiver));
  await assert.rejects(openDriveToken(seal, 'owner-a', withLocalWrappingKey({}, {
    BACKUP_LOCAL_WRAPPING_KEY: 'b2'.repeat(32),
  })));
  const bytes = Buffer.from(seal.wrappedKey, 'base64');
  bytes[30] ^= 1;
  await assert.rejects(openDriveToken({ ...seal, wrappedKey: bytes.toString('base64') }, 'owner-a', receiver));
});
