import { historyAttachmentPaths, historyReports } from '../../app/lib/storage/history-reports.mjs';
import { mkdir, open, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { businessCategoryEntries, readableEntries } from './export.mjs';
import { captureConfigurationIndex, collectAuthRecoveryIndex, collectDatabase, collectOriginals } from './collect.mjs';
import { captureApplicationDump } from './recovery.mjs';
import { readStagedBackup, stageBackup } from './staging.mjs';

const chunkSize = 4 * 1024 * 1024;
const json = (path, value) => ({ path, bytes: Buffer.from(JSON.stringify(value, null, 2) + '\n') });

/** Capture on an encrypted worker volume. The caller persists the seal using the active job fence. */
export async function captureBackup(job, options) {
  if (!/^[a-f0-9-]{36}$/i.test(job.id) || !/^\d+$/.test(String(job.fence))) throw new Error('Invalid job identity');
  const directory = join(options.root, job.id + '-' + job.fence);
  await mkdir(directory, { mode: 0o700 });
  const historyOnly = options.historyOnly === true;
  const originalsDirectory = join(directory, 'originals');
  const dumpPath = join(directory, 'application.dump');
  await mkdir(originalsDirectory, { mode: 0o700 });
  let authIndex;
  const { snapshot, capturedAt, technical } = await collectDatabase(options.database, {
    heartbeat: options.heartbeat,
    historyOnly,
    captureDump: historyOnly ? undefined : async snapshotId => {
      authIndex = await collectAuthRecoveryIndex(options.database, options.scopedReader);
      return captureApplicationDump({ databaseUrl: options.databaseUrl, snapshotId, output: dumpPath, signal: options.signal });
    },
  });

  const objects = [];
  const save = (id,chunks) => stageOriginal(originalsDirectory,id,chunks);
  let historyPaths;
  try {
    if (historyOnly) {
      historyPaths = historyAttachmentPaths(snapshot);
      snapshot.attachments = snapshot.attachments.filter(row => historyPaths.has(row.id));
    }
    for await (const original of collectOriginals(snapshot, options.storage, options.heartbeat, save, { historyOnly })) objects.push(original);
  } catch (cause) {
    throw Object.assign(new Error('Private original collection failed', { cause }), { code: 'original_capture_failed' });
  }
  const byId = new Map(objects.map(object => [object.id,object]));
  const readOriginal = (id,path) => byId.has(id)
    ? originalArchiveEntries(join(originalsDirectory,id), byId.get(id), path, job.id) : null;
  const period = job.period ?? new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', timeZone: 'Asia/Manila' }).format(new Date(capturedAt));
  const technicalRoot = `01_Technical_Recovery/${job.id}`;

  async function* artifacts() {
    if (historyOnly) {
      const reportPaths = new Map(historyPaths);
      for (const object of objects) {
        const path = historyPaths.get(object.id);
        yield* originalArchiveEntries(join(originalsDirectory, object.id), object, path, job.id, true);
        if (object.pieces) reportPaths.set(object.id, path + '.parts/');
      }
      const files = objects.map(object => ({
        path: historyPaths.get(object.id), bytes: object.byteLength, sha256: object.sha256,
        ...(object.pieces ? { pieces: object.pieces } : {}),
      }));
      for (const report of historyReports(snapshot, { capturedAt, paths: reportPaths })) {
        files.push({ path: report.path, bytes: report.bytes.length, sha256: createHash('sha256').update(report.bytes).digest('hex') });
        yield report;
      }
      yield json('Archive_Index.json', { version: 1, capturedAt, status: 'complete', files });
      return;
    }
    yield* businessCategoryEntries(snapshot, { period, tenantArchiveIds: options.tenantArchiveIds });
    yield* readableEntries(snapshot, readOriginal, options.tenantArchiveIds);
    yield json(technicalRoot + '/Auth_Identity_Index.json', authIndex);
    yield { path: technicalRoot + '/Recovery_Instructions.txt', bytes: Buffer.from([
      'Keep every Part ZIP and Delivery_Receipt.json together. Verify with the independently held archive public key.',
      'Use scripts/restore-backup.mjs to extract to a new directory, then scripts/reassemble-backup-dump.mjs to rebuild the PostgreSQL dump.',
      'In a disposable target with matching Supabase roles, extensions and schemas, restore provider-managed Auth identities first.',
      'After the provider restore, run scripts/verify-restored-auth.mjs with the package directory and trusted public key. Set BACKUP_RESTORE_DATABASE_URL to the isolated target. Perform a separate test login.',
      'Compare every source UUID with Auth_Identity_Index.json before restoring dependent application rows. This index omits passwords, OAuth credentials and sessions.',
      'Generate a TOC with pg_restore --list. If the empty target already contains public, omit only its CREATE SCHEMA entry and pass the reviewed TOC via --use-list. Run pg_restore --single-transaction --exit-on-error --no-owner against the empty prepared target. Verify foreign keys and record counts.',
      'Use the attachment index to find extracted originals. Match attachment IDs with Storage_Object_Map.json, then recreate their private bucket keys and verify downloaded bytes against SHA-256.',
      'Before reopening access, validate accounts, policies, historical records, private file access and provider configuration.',
    ].join('\n') + '\n') };
    yield json(technicalRoot + '/Configuration_Index.json', captureConfigurationIndex(options.environment, options.deployment));
    yield json(technicalRoot + '/Storage_Object_Map.json', objects);
    yield json(technicalRoot + '/Capture_Summary.json', {
      capturedAt, technical, records: Object.fromEntries(Object.entries(snapshot).map(([name, rows]) => [name, rows.length])),
      missingCapabilities: ['Provider Auth restoration', 'Provider configuration escrow', 'Isolated database restore drill'],
    });
    let index = 0;
    const pieces = [];
    const checksum = createHash('sha256');
    let total = 0;
    for await (const bytes of createReadStream(dumpPath, { highWaterMark: chunkSize, signal: options.signal })) {
      const path = `${technicalRoot}/Database/application.dump.${String(++index).padStart(6, '0')}`;
      checksum.update(bytes);
      total += bytes.length;
      pieces.push({ path, bytes: bytes.length });
      yield { path, bytes };
    }
    if (total !== technical.bytes || checksum.digest('hex') !== technical.sha256) throw new Error('Technical capture changed');
    yield json(technicalRoot + '/Database/Application_Dump.json', { ...technical, pieces });
  }

  const staged = join(directory, 'capture');
  const manifestSha256 = await stageBackup(staged, job.id, artifacts(), options.heartbeat);
  return {
    capturedAt, manifestSha256, stagePath: staged, directory: join(directory, 'local'),
    entries: () => readStagedBackup(staged, job.id, manifestSha256),
    recoveryComplete: false,
  };
}

export async function stageOriginal(directory, id, chunks) {
  const path = join(directory,id);
  const file = await open(path, 'wx', 0o600);
  try {
    for await (const chunk of chunks) await file.writeFile(chunk);
    await file.sync();
  } catch (error) {
    await unlink(path);
    throw error;
  } finally { await file.close(); }
}

export async function* originalArchiveEntries(source, object, path, jobId, historyOnly = false) {
  const hash = createHash('sha256');
  let length = 0;
  let index = 0;
  // Keep ordinary originals directly browsable. Larger ones use ordered bounded entries.
  const split = object.byteLength > chunkSize;
  if (split) {
    object.archivePath = path;
    object.pieces = [];
  }
  const smallChunks = [];
  for await (const bytes of createReadStream(source, { highWaterMark: chunkSize })) {
    hash.update(bytes);
    length += bytes.length;
    if (length > object.byteLength) throw new Error('Staged original grew');
    if (!split) {
      smallChunks.push(bytes);
      continue;
    }
    const piece = historyOnly ? `${path}.parts/${String(++index).padStart(8, '0')}.bin` : `01_Technical_Recovery/${jobId}/Storage_Parts/${object.id}/${String(++index).padStart(8,'0')}.bin`;
    object.pieces.push(piece);
    yield {path:piece,bytes};
  }
  if (length !== object.byteLength || hash.digest('hex') !== object.sha256) throw new Error('Staged original changed');
  if (!split) yield { path, bytes: Buffer.concat(smallChunks,length) };
}
