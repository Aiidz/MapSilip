import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const output = mkdtempSync(join(tmpdir(), 'mapsilip-rate-limit-'));
after(() => rmSync(output, { recursive: true, force: true }));
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), 'app/lib/backend/auth/rate-limit.ts',
  'app/lib/backend/security.ts', '--rootDir', 'app/lib', '--outDir', output, '--module', 'commonjs',
  '--target', 'ES2020', '--strict', '--skipLibCheck', '--types', 'node'], { stdio: 'pipe' });
const { hashRateLimitBucket, consumeSigninRateLimit, consumeAccountRequestRateLimit, consumeStatusCheckRateLimit } = require(join(output, 'backend/auth/rate-limit.js'));

test('rate-limit HMACs normalize inputs and separate bucket purposes without storing raw values', () => {
  const secret = 'synthetic-hmac-secret-with-at-least-32-bytes';
  const first = hashRateLimitBucket(secret, 'identifier', 'Owner@Example.invalid');
  assert.equal(first, hashRateLimitBucket(secret, 'identifier', 'owner@example.invalid'));
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(hashRateLimitBucket(secret, 'identifier', '192.0.2.1'),
    hashRateLimitBucket(secret, 'client', '192.0.2.1'));
  assert.notEqual(first, 'owner@example.invalid');
});

test('rate limiting rejects missing secrets and untrusted or malformed client addresses before executor use', async () => {
  let calls = 0;
  const executor = { consumeRateLimit: async () => { calls++; return true; } };
  for (const [secret, address] of [['', '192.0.2.1'], ['short', '192.0.2.1'],
    ['synthetic-hmac-secret-with-at-least-32-bytes', '' ], ['synthetic-hmac-secret-with-at-least-32-bytes', 'forged-forwarded-value']]) {
    await assert.rejects(consumeSigninRateLimit(executor, secret, 'owner@example.invalid', address));
  }
  assert.equal(calls, 0);
});

test('rate limiting uses only hashes and fails closed when persistent storage denies or is unavailable', async () => {
  let argumentsSeen;
  const executor = { consumeRateLimit: async (...args) => { argumentsSeen = args; return false; } };
  assert.equal(await consumeSigninRateLimit(executor, 'synthetic-hmac-secret-with-at-least-32-bytes', 'owner@example.invalid', '192.0.2.1'), false);
  assert.equal(argumentsSeen.length, 2);
  assert.ok(argumentsSeen.every(value => /^[0-9a-f]{64}$/.test(value)));
  await assert.rejects(consumeSigninRateLimit({ consumeRateLimit: async () => { throw new Error('private detail'); } },
    'synthetic-hmac-secret-with-at-least-32-bytes', 'owner@example.invalid', '192.0.2.1'), error => !error.message.includes('private detail'));
});

test('account requests have separate persistent buckets and cannot exhaust staff sign-in buckets', async () => {
  const seen = [];
  const executor = { consumeRateLimit: async (...hashes) => { seen.push(hashes); return true; } };
  const secret = 'synthetic-hmac-secret-with-at-least-32-bytes';
  await consumeSigninRateLimit(executor, secret, 'owner@example.invalid', '192.0.2.1');
  await consumeAccountRequestRateLimit(executor, secret, 'owner@example.invalid', '192.0.2.1');
  assert.notEqual(seen[0][0], seen[1][0]);
  assert.notEqual(seen[0][1], seen[1][1]);
  assert.ok(seen.flat().every(value => /^[0-9a-f]{64}$/.test(value)));
  await assert.rejects(consumeAccountRequestRateLimit(executor, secret, 'x@example.invalid', 'forged-address'));
  assert.equal(seen.length, 2);
});

test('applicant status checks have separate persistent buckets and fail closed on untrusted address', async () => {
  const seen = [];
  const executor = { consumeRateLimit: async (...hashes) => { seen.push(hashes); return true; } };
  const secret = 'synthetic-hmac-secret-with-at-least-32-bytes';
  await consumeSigninRateLimit(executor, secret, 'applicant@example.invalid', '192.0.2.1');
  await consumeAccountRequestRateLimit(executor, secret, 'applicant@example.invalid', '192.0.2.1');
  await consumeStatusCheckRateLimit(executor, secret, 'applicant@example.invalid', '192.0.2.1');
  assert.equal(seen.length, 3);
  assert.notEqual(seen[2][0], seen[0][0]);
  assert.notEqual(seen[2][0], seen[1][0]);
  assert.notEqual(seen[2][1], seen[0][1]);
  assert.notEqual(seen[2][1], seen[1][1]);
  assert.ok(seen.flat().every(value => /^[0-9a-f]{64}$/.test(value)));
  await assert.rejects(consumeStatusCheckRateLimit(executor, secret, 'applicant@example.invalid', 'malformed-ip'));
  await assert.rejects(consumeStatusCheckRateLimit({ consumeRateLimit: async () => { throw new Error('fail'); } }, secret, 'applicant@example.invalid', '192.0.2.1'));
});
