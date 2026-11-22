import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { link, mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const hashPattern = /^[a-f0-9]{64}$/;
const limit = 8 * 1024 * 1024;

async function writeExclusive(path, bytes) {
  const file = await open(path, 'wx', 0o600);
  try {
    await file.writeFile(bytes);
    await file.sync();
  } finally {
    await file.close();
  }
}

async function readBounded(path) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const { size } = await file.stat();
    if (size > limit || !(await file.stat()).isFile()) throw new Error('Invalid staging file');
    const buffer = Buffer.alloc(size + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset !== size) throw new Error('Staging file size changed');
    return buffer.subarray(0, size);
  } finally {
    await file.close();
  }
}

/** A job/fence-specific directory on a provisioned private encrypted persistent volume. */
export async function stageBackup(directory, jobId, entries, heartbeat) {
  await mkdir(directory, { mode: 0o700 });
  const manifest = { version: 1, jobId, files: [] };
  const paths = new Set();
  const digests = new Set();
  for await (const file of entries) {
    const path = file.path;
    const key = typeof path === 'string' ? path.toLowerCase() : '';
    if (!key || paths.has(key) || path.length > 240 ||
        path.split('/').some(segment => !/^[a-z0-9_-][a-z0-9_.-]{0,99}$/i.test(segment) || segment.includes('..'))) {
      throw new Error('Invalid staged artifact path');
    }
    if (!(file.bytes instanceof Uint8Array) || file.bytes.length > limit) throw new Error('Invalid or oversized staging artifact');
    const sha256 = digest(file.bytes);
    if (!digests.has(sha256)) {
      await writeExclusive(join(directory, sha256), file.bytes);
      digests.add(sha256);
    }
    paths.add(key);
    manifest.files.push({ path, sha256, byteLength: file.bytes.length });
    await heartbeat?.();
  }
  if (!manifest.files.length) throw new Error('Cannot seal an empty capture');
  const bytes = Buffer.from(JSON.stringify(manifest));
  if (bytes.length > limit) throw new Error('Staging manifest too large');
  await writeExclusive(join(directory, 'manifest.pending'), bytes);
  await link(join(directory, 'manifest.pending'), join(directory, 'manifest.json'));
  const dir = await open(directory, 'r');
  try { await dir.sync(); } finally { await dir.close(); }
  return digest(bytes);
}

/** The expected digest must come from the fenced job registry, not the staging volume. */
export async function* readStagedBackup(directory, jobId, expectedDigest) {
  const raw = await readBounded(join(directory, 'manifest.json'));
  if (digest(raw) !== expectedDigest) throw new Error('Staging manifest checksum mismatch');
  const manifest = JSON.parse(raw);
  if (manifest.version !== 1 || manifest.jobId !== jobId) throw new Error('Staging capture belongs to another job');
  for (const file of manifest.files) {
    if (!hashPattern.test(file.sha256)) throw new Error('Invalid staging checksum');
    const bytes = await readBounded(join(directory, file.sha256));
    if (digest(bytes) !== file.sha256 || bytes.length !== file.byteLength) throw new Error('Staging artifact checksum mismatch');
    yield { path: file.path, sha256: file.sha256, bytes };
  }
}
