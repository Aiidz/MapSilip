import { createHash } from 'node:crypto';

const sources = [
  ['rooms', 'id'], ['tenant_profiles', 'user_id'], ['room_assignments', 'id'],
  ['invoices', 'id'], ['payments', 'id'], ['maintenance_requests', 'id'],
  ['concerns', 'id'], ['planned_visits', 'id'], ['notifications', 'id'],
  ['operational_audit', 'id'], ['attachments', 'id'],
];



/** Capture through a dedicated SELECT-only identity on a direct PostgreSQL connection. */
export async function collectDatabase(client, { captureDump, heartbeat, historyOnly = false, rowLimit = 100000 } = {}) {
  await client.query('begin isolation level repeatable read read only');
  try {
    const { rows: [boundary] } = await client.query(
      'select pg_export_snapshot() as snapshot_id, transaction_timestamp() as captured_at',
    );
    const snapshot = {};
    for (const [table, key] of sources) {
      if (historyOnly && ['planned_visits', 'notifications', 'operational_audit'].includes(table)) continue;
      const rows = [];
      while (true) {
        const cursor = rows.at(-1)?.[key] ?? null;
        const filter = cursor === null ? '' : `where ${key} > $1`;
        const page = await client.query(`select * from public.${table} ${filter} order by ${key} limit 500`,
          cursor === null ? [] : [cursor]);
        rows.push(...page.rows);
        if (rows.length > rowLimit) throw new Error('Backup source exceeds snapshot row budget: ' + table);
        await heartbeat?.();
        if (page.rows.length < 500) break;
      }
      snapshot[table] = rows;
    }
    const technical = await captureDump?.(boundary.snapshot_id);
    await client.query('commit');
    return { snapshot, capturedAt: boundary.captured_at, technical };
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  }
}

function detectedType(bytes) {
  if (bytes.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return 'image/png';
  if (bytes.subarray(0, 3).toString('hex') === 'ffd8ff') return 'image/jpeg';
  return null;
}

/** Strict reconciliation for the private bucket. Missing, unpaired, or changed bytes fail closed. */
export async function* collectOriginals(snapshot, storage, heartbeat, save, { historyOnly = false } = {}) {
  const expected = new Map();
  const linked = new Map([
    ['payments', ['attachment_id', 'payment']],
    ['maintenance_requests', ['attachment_id', 'maintenance']],
    ['room_assignments', ['contract_attachment_id', 'contract']],
  ]);
  const byId = new Map(snapshot.attachments.map(row => [row.id, row]));
  for (const [table, [column, purpose]] of linked) {
    for (const row of snapshot[table]) {
      if (row[column] == null) continue;
      if (byId.get(row[column])?.purpose !== purpose) throw new Error('Attachment relationship mismatch');
    }
  }
  for (const row of snapshot.attachments) {
    if (row.deleted_at) continue;
    if (row.bucket_name !== 'mapsilip_evidence' || typeof row.path !== 'string' ||
        !/^[0-9a-f-]{36}\/[0-9a-f-]{36}$/i.test(row.path) || row.path.split('/')[1] !== row.id ||
        expected.has(row.path)) throw new Error('Invalid private attachment inventory');
    expected.set(row.path, row);
  }

  const observed = new Set();
  for await (const object of storage.list()) {
    const row = expected.get(object.path);
    if (!row && historyOnly) continue;
    if (!row || observed.has(object.path)) throw new Error('Unpaired or duplicate private Storage object');
    observed.add(object.path);
    if (!object.version) throw new Error('Missing Storage object version');
    if (row.byte_size !== object.bytes || row.mime_type !== object.mimeType) throw new Error('Storage metadata mismatch');
    const stream = await storage.download(object);
    const hash = createHash('sha256');
    let count = 0;
    let prefix = Buffer.alloc(0);
    let sha256;
    let lastHeartbeat = Date.now();
    async function* checkedChunks() {
      for await (const chunk of Buffer.isBuffer(stream) ? [stream] : stream) {
        count += chunk.byteLength;
        if (!(chunk instanceof Uint8Array) || count > object.bytes) throw new Error('Storage file integrity mismatch');
        hash.update(chunk);
        if (prefix.length < 8) prefix = Buffer.concat([prefix,chunk.subarray(0,8-prefix.length)]);
        if (Date.now() - lastHeartbeat >= 15000) {
          await heartbeat?.();
          lastHeartbeat = Date.now();
        }
        yield chunk;
      }
      if (count !== row.byte_size || detectedType(prefix) !== row.mime_type) throw new Error('Storage file integrity mismatch');
      sha256 = hash.digest('hex');
      if (row.checksum_sha256 && sha256 !== row.checksum_sha256) throw new Error('Storage checksum mismatch');
      if ((await storage.version(object.path)) !== object.version) throw new Error('Storage object changed during capture');
    }
    await save(row.id, checkedChunks());
    await heartbeat?.();
    yield { id: row.id, path: row.path, bucket: row.bucket_name, purpose: row.purpose,
      mimeType: row.mime_type, sha256, sourceVersion: object.version, byteLength: count };
  }
  if (observed.size !== expected.size) throw new Error('Required private Storage objects are missing');
}

/** A caller-scoped Supabase bucket client. This adapter never signs URLs or writes objects. */
export function privateStorageReader(bucket, signal) {
  async function info(path) {
    const { data, error } = await bucket.info(path);
    if (error || !data || typeof data.version !== 'string' || !data.version) {
      throw new Error('Private Storage metadata unavailable');
    }
    return data;
  }

  return {
    async *list() {
      const pending = [''];
      const visited = new Set();
      for (const prefix of pending) {
        if (visited.has(prefix)) throw new Error('Duplicate Storage directory');
        visited.add(prefix);
        for (let offset = 0; ; offset += 100) {
          const { data, error } = await bucket.list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
          if (error || !Array.isArray(data)) throw new Error('Private Storage inventory unavailable');
          for (const row of data) {
            if (!/^[0-9a-f-]{36}$/i.test(row.name)) throw new Error('Unexpected Storage object name');
            const path = prefix ? prefix + '/' + row.name : row.name;
            if (row.id == null) {
              if (prefix) throw new Error('Unexpected nested Storage directory');
              pending.push(path);
              continue;
            }
            const meta = await info(path);
            yield { path, bytes: meta.size, mimeType: meta.contentType, version: meta.version };
          }
          if (data.length < 100) break;
        }
      }
    },
    async download(object) {
      if (!Number.isSafeInteger(object.bytes) || object.bytes <= 0) {
        throw new Error('Invalid private Storage size');
      }
      const { data, error } = await bucket.download(object.path, {}, { signal }).asStream();
      if (error || !data) throw new Error('Private Storage read unavailable or incomplete');
      return data;
    },
    async version(path) {
      return (await info(path)).version;
    },
  };
}

/** Identity references for a restricted recovery set. The SELECT grants should be column-scoped. */
export async function collectAuthRecoveryIndex(client, scopedReader = false) {
  const { rows } = await client.query(`
    select id,email,phone,created_at,email_confirmed_at,phone_confirmed_at,deleted_at
    from ${scopedReader ? 'mapsilip_backup.source_auth_inventory()' : 'auth.users'} order by id
  `);
  return {
    version: 1, accounts: rows,
    recoveryComplete: false,
    requires: ['Provider-approved identity restoration or controlled account recreation', 'UUID and ownership reconciliation'],
  };
}

const configKeys = [
  'MAPSILIP_APP_ORIGIN', 'NEXT_PUBLIC_SUPABASE_URL', 'MAPSILIP_PUSH_ENABLED',
  'STORAGE_MANAGEMENT_ENABLED', 'BACKUP_WORKER_ENABLED', 'GOOGLE_DRIVE_REDIRECT_URI',
];

export function captureConfigurationIndex(environment, deployment) {
  if (!/^[a-f0-9]{40}$/i.test(deployment.commit)) throw new Error('Deployment commit is required');
  const settings = {};
  for (const key of configKeys) {
    if (environment[key] == null || environment[key] === '') continue;
    if (key.endsWith('_URL') || key.endsWith('_URI') || key.endsWith('_ORIGIN')) {
      const value = new URL(environment[key]);
      if (value.protocol !== 'https:' || value.username || value.password || value.search || value.hash) {
        throw new Error('Invalid configuration URL');
      }
      settings[key] = value.href;
    } else {
      if (!['true', 'false'].includes(environment[key])) throw new Error('Invalid configuration flag');
      settings[key] = environment[key];
    }
  }
  return {
    version: 1, commit: deployment.commit, settings,
    recoveryComplete: false,
    requires: ['Auth provider settings and redirect allowlists', 'Separate authorized credential provisioning',
      'Migration and extension inventory', 'Jobs and Storage policies', 'Isolated deployment and restore verification'],
  };
}
