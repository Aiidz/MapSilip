import { createHash } from 'node:crypto';
import { ensureDriveFolder, uploadDrivePart, verifyPrivateDriveFolder } from './drive.mjs';

const types = {
  csv: 'text/csv', json: 'application/json', txt: 'text/plain', zip: 'application/zip',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf',
};

/**
 * Publish prepared artifacts from a sealed capture. Registry callbacks must persist
 * reservations and encrypted session checkpoints before acknowledging them.
 */
export async function publishDriveTree(request, { rootId, ownerId, backupId, artifacts, registry, sharedPeriodFolders = false }) {
  await verifyPrivateDriveFolder(request, rootId, ownerId);
  const directories = new Map([['', rootId]]);
  const paths = new Set();
  const files = [];

  async function directory(path) {
    if (directories.has(path)) return directories.get(path);
    const segments = path.split('/');
    const name = segments.pop();
    const parentId = await directory(segments.join('/'));
    // Year and month folders share a reservation across history jobs.
    const namespace = sharedPeriodFolders && /^\d{4}(?:\/(0[1-9]|1[0-2]))?$/.test(path) ? 'history-period-v1' : backupId;
    const logicalId = createHash('sha256').update(JSON.stringify([namespace, path])).digest('hex');
    const { id } = await registry.reserve({ rootId, logicalId, parentId, kind: 'folder' });
    await ensureDriveFolder(request, { id, parentId, logicalId, name, ownerId });
    directories.set(path, id);
    return id;
  }

  for await (const artifact of artifacts) {
    const path = artifact.path;
    const segments = typeof path === 'string' && path.length <= 240 ? path.split('/') : [];
    const key = typeof path === 'string' ? path.toLowerCase() : '';
    if (!segments.length || paths.has(key) ||
        segments.some(segment => !/^[a-z0-9_-][a-z0-9_.-]{0,99}$/i.test(segment) || segment.includes('..') || segment.endsWith('.'))) {
      throw new Error('Invalid or duplicate Drive archive path');
    }
    paths.add(key);
    const name = segments.pop();
    const mimeType = types[name.split('.').at(-1).toLowerCase()] ?? 'application/octet-stream';
    const parentId = await directory(segments.join('/'));
    await verifyPrivateDriveFolder(request, parentId, ownerId);
    const sha256 = artifact.sha256;
    const logicalId = createHash('sha256').update(JSON.stringify([backupId, path, sha256])).digest('hex');
    const { id, session } = await registry.reserve({ rootId, logicalId, parentId, kind: 'file' });
    await uploadDrivePart(request, { id, parentId, artifactId: logicalId, name, sha256, mimeType }, artifact.bytes, {
      session,
      checkpoint: progress => registry.checkpoint(id, progress),
    });
    await registry.verified(id, { sha256, bytes: artifact.bytes.length });
    files.push({ path, driveFileId: id, sha256, bytes: artifact.bytes.length });
  }
  return files;
}
