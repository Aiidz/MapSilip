import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkWorkerEnvironment, checkWorkerFiles } from '../worker/backup/preflight.mjs';
import { claimBackupJob } from '../worker/backup/jobs.mjs';

test('preflight names missing and invalid settings without echoing credentials', () => {
  const errors = checkWorkerEnvironment({ BACKUP_SOURCE_DATABASE_URL: 'not-a-dsn-secret', BACKUP_SOURCE_COMMIT: 'short' });
  assert.ok(errors.includes('Missing BACKUP_SOURCE_STORAGE_PASSWORD'));
  assert.ok(errors.includes('Invalid BACKUP_SOURCE_DATABASE_URL'));
  assert.ok(errors.includes('Invalid BACKUP_SOURCE_COMMIT'));
  assert.ok(!errors.join(' ').includes('not-a-dsn-secret'));
});

test('preflight rejects duplicate aliases and mismatched signing keys', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mapsilip-preflight-'));
  const env = {
    BACKUP_ENCRYPTED_STAGING_ROOT: root, BACKUP_TENANT_ALIAS_FILE: join(root, 'aliases'),
    BACKUP_SIGNING_KEY_FILE: join(root, 'signing'), BACKUP_VERIFICATION_KEY_FILE: join(root, 'verify'),
  };
  const pair = generateKeyPairSync('ed25519');
  try {
    await writeFile(env.BACKUP_TENANT_ALIAS_FILE, '{}', { mode: 0o600 });
    await writeFile(env.BACKUP_SIGNING_KEY_FILE, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    await writeFile(env.BACKUP_VERIFICATION_KEY_FILE, pair.publicKey.export({ type: 'spki', format: 'pem' }));
    assert.deepEqual((await checkWorkerFiles(env)).errors, []);
    await writeFile(env.BACKUP_VERIFICATION_KEY_FILE, generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }));
    await writeFile(env.BACKUP_TENANT_ALIAS_FILE, JSON.stringify({
      '00000000-0000-4000-8000-000000000001': 'Alias', '00000000-0000-4000-8000-000000000002': 'alias',
    }));
    assert.equal((await checkWorkerFiles(env)).errors.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('staging worker claims only a job belonging to its assigned owner', async () => {
  const owner = '00000000-0000-4000-8000-000000000001';
  const client = { async query(sql, args) {
    assert.match(sql, /and owner_id=\$2/);
    assert.deepEqual(args, [120, owner]);
    return { rows: [] };
  } };
  assert.equal(await claimBackupJob(client, 120, owner), null);
});
