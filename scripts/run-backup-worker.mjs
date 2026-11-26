import { withLocalWrappingKey } from '../worker/backup/local-key.mjs';
import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { checkWorkerEnvironment, checkWorkerFiles } from '../worker/backup/preflight.mjs';
import { join } from 'node:path';
import { captureBackup } from '../worker/backup/capture.mjs';
import { privateStorageReader } from '../worker/backup/collect.mjs';
import { openDriveToken, refreshDriveAccess, sealDriveToken } from '../worker/backup/oauth.mjs';
import { runBackupJob } from '../worker/backup/run.mjs';
import { readStagedBackup } from '../worker/backup/staging.mjs';
import { ensureDriveArchiveRoot } from '../worker/backup/drive.mjs';
import { transferRegistry } from '../worker/backup/transfer-registry.mjs';

function setting(name) {
  const value = process.env[name];
  if (!value) throw new Error('Missing setting ' + name);
  return value;
}

function scopedStorage() {
  const url = setting('NEXT_PUBLIC_SUPABASE_URL');
  const publishable = setting('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  const auth = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
  let session;
  return createClient(url, publishable, {
    auth,
    accessToken: async () => {
      if (process.env.BACKUP_SOURCE_STORAGE_TOKEN) return process.env.BACKUP_SOURCE_STORAGE_TOKEN;
      if (!session || session.expires_at < Date.now() / 1000 + 60) {
        const { data, error } = await createClient(url, publishable, {auth}).auth.signInWithPassword({
          email: setting('BACKUP_SOURCE_STORAGE_EMAIL'), password: setting('BACKUP_SOURCE_STORAGE_PASSWORD'),
        });
        if (error || data.user?.id !== setting('BACKUP_SOURCE_STORAGE_SUBJECT') || !data.session) {
          throw new Error('Source Storage identity verification failed');
        }
        session = data.session;
      }
      return session.access_token;
    },
  }).storage;
}

async function workerCloudToken() {
  if (process.env.BACKUP_WORKER_GOOGLE_AUTH === 'gcloud-adc') {
    return execFileSync('gcloud', ['auth', 'application-default', 'print-access-token'], {
      encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  }
  const identity = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
    headers: { 'Metadata-Flavor': 'Google' }, redirect: 'error', signal: AbortSignal.timeout(5000),
  });
  if (!identity.ok || identity.headers.get('Metadata-Flavor') !== 'Google') throw new Error('Worker workload identity unavailable');
  return (await identity.json()).access_token;
}

async function kmsCall(keyId, operation, data) {
  if (keyId !== setting('BACKUP_TOKEN_KEY_ID') ||
      !/^projects\/[a-z0-9-]+\/locations\/[a-z0-9-]+\/keyRings\/[\w-]+\/cryptoKeys\/[\w-]+$/.test(keyId)) {
    throw new Error('Invalid backup key resource');
  }
  const access_token = await workerCloudToken();
  const response = await fetch('https://cloudkms.googleapis.com/v1/' + keyId + ':' + operation, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
    headers: { Authorization: 'Bearer ' + access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Worker KMS request failed');
  return response.json();
}

const kms = withLocalWrappingKey({
  async wrap(key, keyId, aad) {
    const { ciphertext } = await kmsCall(keyId, 'encrypt', {
      plaintext: key.toString('base64'), additionalAuthenticatedData: aad.toString('base64'),
    });
    if (typeof ciphertext !== 'string') throw new Error('Worker KMS ciphertext unavailable');
    return ciphertext;
  },
  async unwrap(ciphertext, keyId, aad) {
    const { plaintext } = await kmsCall(keyId, 'decrypt', {
      ciphertext, additionalAuthenticatedData: aad.toString('base64'),
    });
    if (typeof plaintext !== 'string') throw new Error('Worker KMS plaintext unavailable');
    return Buffer.from(plaintext, 'base64');
  },
});

async function main() {
  const bootstrap = process.argv.includes('--bootstrap-drive-root');
  const requiredForDrive = ['BACKUP_WORKER_REGISTRY_URL', 'BACKUP_STAGING_OWNER_ID', 'BACKUP_TOKEN_KEY_ID',
    'GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET', 'BACKUP_LOCAL_WRAPPING_KEY'];
  const errors = checkWorkerEnvironment(process.env).filter(error =>
    !bootstrap || requiredForDrive.some(name => error.endsWith(' ' + name)));
  if (errors.length) throw new Error('Preflight: ' + errors.join('; '));
  const registry = new Client({ connectionString: setting('BACKUP_WORKER_REGISTRY_URL') });
  const ownerId = setting('BACKUP_STAGING_OWNER_ID');
  const timeout = AbortSignal.timeout(60 * 60 * 1000);
  await registry.connect();
  try {
    {
      const { rows: [grant] } = await registry.query(
        "select account_id,envelope,staging_root_id from mapsilip_backup.drive_connections where owner_id=$1 and state='connected'",
        [ownerId],
      );
      if (!grant) throw new Error('Preflight: staging owner must connect Google Drive');
      const google = { clientId: setting('GOOGLE_DRIVE_CLIENT_ID'), clientSecret: setting('GOOGLE_DRIVE_CLIENT_SECRET') };
      const refresh = await openDriveToken(grant.envelope, ownerId, kms);
      const token = await refreshDriveAccess(google, refresh);
      if (token.rotatedRefreshToken) {
        const envelope = await sealDriveToken(token.rotatedRefreshToken, ownerId, setting('BACKUP_TOKEN_KEY_ID'), kms);
        const saved = await registry.query(
          "update mapsilip_backup.drive_connections set envelope=$3,updated_at=now() where owner_id=$1 and envelope=$2::jsonb and state='connected'",
          [ownerId, grant.envelope, envelope],
        );
        if (saved.rowCount !== 1) throw new Error('Drive grant changed');
      }
      const request = async (url, options) => {
        if (new URL(url).origin !== 'https://www.googleapis.com') throw new Error('Unexpected Drive host');
        return fetch(url, { ...options, headers: { ...options.headers, Authorization: 'Bearer ' + token.accessToken },
          signal: AbortSignal.timeout(30000) });
      };
      let id = grant.staging_root_id;
      if (!id) {
        const ids = await request('https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive', { redirect: 'error' });
        if (!ids.ok) throw new Error('Drive archive root reservation failed');
        const candidate = (await ids.json()).ids?.[0];
        if (typeof candidate !== 'string' || !candidate) throw new Error('Drive archive root ID unavailable');
        const reserved = await registry.query(`update mapsilip_backup.drive_connections
          set staging_root_id=coalesce(staging_root_id,$3) where owner_id=$1 and account_id=$2 and state='connected'
          returning staging_root_id`, [ownerId, grant.account_id, candidate]);
        id = reserved.rows[0]?.staging_root_id;
        if (!id) throw new Error('Drive connection changed');
      }
      await ensureDriveArchiveRoot(request, { id, ownerId: grant.account_id });
      if (bootstrap) return { driveArchiveRootId: id };
    }
    try {
      await registry.query('select capture_seal_sha256,local_receipt_sha256 from mapsilip_backup.jobs where owner_id=$1 limit 0', [ownerId]);
      await registry.query('select drive_id,session_envelope from mapsilip_backup.drive_artifacts limit 0');
    } catch {
      throw new Error('Preflight: registry schema or read permissions unavailable');
    }
    const connection = await registry.query("select account_id from mapsilip_backup.drive_connections where owner_id=$1 and state='connected'", [ownerId]);
    if (!connection.rowCount) throw new Error('Preflight: staging owner must connect Google Drive');
    const files = await checkWorkerFiles(process.env);
    if (files.errors.length) throw new Error('Preflight: ' + files.errors.join('; '));
    for (const tool of ['pg_dump', 'pg_restore']) {
      try { execFileSync(tool, ['--version'], { stdio: 'ignore', timeout: 5000 }); }
      catch { throw new Error('Preflight: ' + tool + ' is unavailable'); }
    }
    const databaseUrl = setting('BACKUP_SOURCE_DATABASE_URL');
    const root = setting('BACKUP_ENCRYPTED_STAGING_ROOT');
    const { tenantArchiveIds, signingKey, verificationKey } = files;
    const storage = privateStorageReader(scopedStorage().from('mapsilip_evidence'), timeout);
    if (process.argv.includes('--preflight')) {
      const source = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
      try {
        await source.connect();
        await source.query('begin read only');
        await source.query('select 1 from public.rooms limit 0');
        await source.query('select bucket_name, path, checksum_sha256 from public.attachments limit 0');
        await source.query('select id,email,phone,created_at,email_confirmed_at,phone_confirmed_at,deleted_at from mapsilip_backup.source_auth_inventory() limit 0');
        await source.query('rollback');
      } catch {
        throw new Error('Preflight: source PostgreSQL connection or required read grants unavailable');
      } finally {
        await source.end();
      }
      try {
        for await (const item of storage.list()) {
          if (!item.version) throw new Error('Missing object version');
          break;
        }
      } catch {
        throw new Error('Preflight: scoped source Storage permissions unavailable');
      }
      return { preflight: 'configuration, registry, source and Storage read checks passed', liveDestinationsVerified: false };
    }
    const heartbeat = await registry.query(
      `update mapsilip_backup.drive_connections set worker_seen_at=now()
       where owner_id=$1 and state='connected' and staging_root_id is not null`, [ownerId],
    );
    if (heartbeat.rowCount !== 1) throw new Error('Preflight: Drive connection unavailable');
    return await runBackupJob(registry, {
      ownerId, signingKey, verificationKey,
      async collect(job, heartbeat) {
        if (job.owner_id !== ownerId) throw new Error('Job owner is outside this worker scope');
        const previous = await registry.query(
          'select capture_seal_sha256,capture_fence from mapsilip_backup.jobs where id=$1 and fence=$2', [job.id, job.fence]);
        const saved = previous.rows[0];
        if (saved?.capture_seal_sha256 && /^\d+$/.test(String(saved.capture_fence))) {
          const source = join(root, job.id + '-' + saved.capture_fence, 'capture');
          return { manifestSha256: saved.capture_seal_sha256,
            directory: join(root, job.id + '-delivery-' + job.fence),
            entries: () => readStagedBackup(source, job.id, saved.capture_seal_sha256), recoveryComplete: false };
        }
        const database = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
        await database.connect();
        try {
          const capture = await captureBackup(job, {
            root, database, databaseUrl, storage, heartbeat, signal: timeout, tenantArchiveIds, scopedReader: true,
            historyOnly: job.job_key?.startsWith('history:') ||
              (job.reason !== 'manual' && process.env.BACKUP_SCHEDULED_HISTORY_ENABLED === 'true'),
            environment: process.env, deployment: { commit: setting('BACKUP_SOURCE_COMMIT') },
          });
          const result = await registry.query(`update mapsilip_backup.jobs
            set capture_seal_sha256=$3,capture_fence=$2 where id=$1 and fence=$2 and lease_until>now()`,
          [job.id, job.fence, capture.manifestSha256]);
          if (result.rowCount !== 1) throw new Error('Capture lease lost');
          return capture;
        } finally {
          await database.end();
        }
      },
      async verifyRequiredRecoveryArtifacts(capture) {
        return capture.recoveryComplete === true;
      },
      async pinPackageReceipt(job, capture, receiptSha256) {
        const receipt = await registry.query(`update mapsilip_backup.jobs set local_receipt_sha256=$3
          where id=$1 and fence=$2 and lease_until>now() and capture_seal_sha256=$4 and (local_receipt_sha256 is null or local_receipt_sha256=$3)`,
        [job.id, job.fence, receiptSha256, capture.manifestSha256]);
        if (receipt.rowCount !== 1) throw new Error('Delivery receipt registry write failed');
      },
      async drive(job) {
        const { rows: [connection] } = await registry.query(`select account_id,envelope,staging_root_id
          from mapsilip_backup.drive_connections where owner_id=$1 and state='connected'`, [job.owner_id]);
        if (!connection) throw new Error('Drive connection unavailable');
        const google = { clientId: setting('GOOGLE_DRIVE_CLIENT_ID'), clientSecret: setting('GOOGLE_DRIVE_CLIENT_SECRET') };
        const refresh = await openDriveToken(connection.envelope, job.owner_id, kms);
        const token = await refreshDriveAccess(google, refresh);
        if (token.rotatedRefreshToken) {
          const envelope = await sealDriveToken(token.rotatedRefreshToken, job.owner_id, setting('BACKUP_TOKEN_KEY_ID'), kms);
          const updated = await registry.query(`update mapsilip_backup.drive_connections set envelope=$3,updated_at=now()
            where owner_id=$1 and envelope=$2::jsonb and state='connected'`, [job.owner_id, connection.envelope, envelope]);
          if (updated.rowCount !== 1) throw new Error('Drive connection changed during refresh');
        }
        const request = async (url, options) => {
          const locked = await registry.query(`select 1 from mapsilip_backup.jobs j
            join mapsilip_backup.drive_connections c on c.owner_id=j.owner_id and c.state='connected'
            where j.id=$1 and j.fence=$2 and j.lease_until>now() and c.account_id=$3 and c.staging_root_id=$4`, [job.id, job.fence, connection.account_id, connection.staging_root_id]);
          if (!locked.rowCount || new URL(url).origin !== 'https://www.googleapis.com') throw new Error('Drive request no longer authorized');
          return fetch(url, { ...options, headers: { ...options.headers, Authorization: 'Bearer ' + token.accessToken },
            signal: AbortSignal.timeout(30000) });
        };
        const rootId = connection.staging_root_id;
        if (!rootId) throw new Error('Drive archive root unavailable');
        return { request, rootId, ownerId: connection.account_id,
          registry: transferRegistry(registry, job, {
            async allocateId() {
              const response = await request('https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive', { redirect: 'error' });
              if (!response.ok) throw new Error('Drive ID allocation failed');
              const id = (await response.json()).ids?.[0];
              if (typeof id !== 'string' || !id) throw new Error('Drive ID unavailable');
              return id;
            },
            sealSession: (url, id) => sealDriveToken(url, rootId + ':' + id, setting('BACKUP_TOKEN_KEY_ID'), kms),
            openSession: (envelope, id) => openDriveToken(envelope, rootId + ':' + id, kms),
          }),
        };
      },
      async recordDriveReceipt(job, files, capture) {
        const result = await registry.query(`update mapsilip_backup.jobs set drive_inventory=$3
          where id=$1 and fence=$2 and lease_until>now() and capture_seal_sha256=$4`,
        [job.id, job.fence, JSON.stringify(files), capture.manifestSha256]);
        return result.rowCount === 1 && files.length > 0;
      },
      async checkLocalCustodyReceipt(job) {
        const result = await registry.query(`select 1 from mapsilip_backup.jobs
          where id=$1 and fence=$2 and local_custody_at is not null`, [job.id, job.fence]);
        return result.rowCount === 1;
      },
    });
  } finally {
    await registry.end();
  }
}

try {
  const result = await main();
  console.log(result ? JSON.stringify(result) : 'No backup job available.');
} catch (error) {
  console.error(/^(Missing setting |Preflight: )/.test(error.message) ? error.message : 'Backup worker unavailable or lease lost.');
  process.exitCode = 1;
}
