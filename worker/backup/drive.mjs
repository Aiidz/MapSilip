import { createHash } from 'node:crypto';

const drive = 'https://www.googleapis.com/drive/v3';
const upload = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable';
const fields = 'id,parents,size,mimeType,appProperties,trashed';
const chunkSize = 256 * 1024;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function driveUrl(url) {
  const parsed = new URL(url);
  if (parsed.origin !== 'https://www.googleapis.com' || parsed.username || parsed.password) {
    throw new Error('Unexpected Drive upload origin');
  }
  return parsed.href;
}

async function checkContent(request, url, bytes, sha256) {
  const response = await request(url + '?alt=media', { redirect: 'error' });
  if (!response.ok || !response.body) throw new Error('Drive readback unavailable');
  const reader = response.body.getReader();
  const digest = createHash('sha256');
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > bytes) throw new Error('Drive checksum mismatch');
      digest.update(value);
    }
    if (size !== bytes || digest.digest('hex') !== sha256) throw new Error('Drive checksum mismatch');
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

/** Publish a bounded artifact to a prevalidated private parent with a durably reserved Drive ID. */
export async function uploadDrivePart(request, spec, bytes, transfer = {}) {
  const mimeType = spec.mimeType ?? 'application/zip';
  if (!/^[a-z0-9.+_-]+\/[a-z0-9.+_-]+$/i.test(mimeType) ||
      mimeType.startsWith('application/vnd.google-apps.')) throw new Error('Invalid Drive artifact MIME type');
  if (!(bytes instanceof Uint8Array) || bytes.length === 0 || hash(bytes) !== spec.sha256) {
    throw new Error('Staged ZIP checksum mismatch');
  }
  const url = drive + '/files/' + encodeURIComponent(spec.id);
  const properties = { archiveArtifact: spec.artifactId, sha256: spec.sha256 };
  async function lookup() {
    const response = await request(url + '?fields=' + fields, { redirect: 'error' });
    if (response.status === 404) return false;
    if (!response.ok) throw new Error('Drive file lookup failed: ' + response.status);
    const file = await response.json();
    if (file.id !== spec.id || file.trashed || file.parents?.length !== 1 ||
        file.parents[0] !== spec.parentId || file.mimeType !== mimeType ||
        file.size !== String(bytes.length) || file.appProperties?.archiveArtifact !== spec.artifactId ||
        file.appProperties?.sha256 !== spec.sha256) throw new Error('Drive reserved file identity mismatch');
    await checkContent(request, url, bytes.length, spec.sha256);
    return true;
  }
  if (await lookup()) return { id: spec.id, reused: true };

  let session = transfer.session ? driveUrl(transfer.session) : null;
  let offset = 0;
  function acknowledged(response) {
    const range = response.headers.get('Range');
    if (!range) return 0;
    const match = /^bytes=0-(\d+)$/.exec(range);
    const next = match ? Number(match[1]) + 1 : NaN;
    if (!Number.isSafeInteger(next) || next >= bytes.length) throw new Error('Invalid Drive acknowledgement');
    return next;
  }

  if (session) {
    const status = await request(session, {
      method: 'PUT', redirect: 'manual', headers: { 'Content-Range': 'bytes */' + bytes.length },
    });
    if (status.ok && await lookup()) return { id: spec.id, reused: true };
    if (status.status === 308) offset = acknowledged(status);
    else if (status.status === 404 || status.status === 410) session = null;
    else throw new Error('Drive session status failed: ' + status.status);
  }
  if (!session) {
    const start = await request(upload, {
      method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', 'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(bytes.length) },
      body: JSON.stringify({ id: spec.id, name: spec.name, mimeType,
        parents: [spec.parentId], appProperties: properties }),
    });
    if (start.status === 409 && await lookup()) return { id: spec.id, reused: true };
    const location = start.headers.get('Location');
    if (!start.ok || !location) throw new Error('Drive session creation failed: ' + start.status);
    session = driveUrl(location);
    await transfer.checkpoint?.({ session, offset });
  }
  while (offset < bytes.length) {
    const end = Math.min(offset + chunkSize, bytes.length);
    const response = await request(session, {
      method: 'PUT', redirect: 'manual', body: bytes.subarray(offset, end),
      headers: { 'Content-Type': mimeType, 'Content-Range': `bytes ${offset}-${end - 1}/${bytes.length}` },
    });
    if (response.ok) {
      if (!await lookup()) throw new Error('Drive upload missing after acknowledgement');
      return { id: spec.id, reused: false };
    }
    if (response.status !== 308) throw new Error('Drive upload failed: ' + response.status);
    const next = acknowledged(response);
    if (next <= offset || next > end) throw new Error('Drive upload made no valid progress');
    offset = next;
    await transfer.checkpoint?.({ session, offset });
  }
  throw new Error('Drive upload ended without verification');
}

/** Check the configured owner and ancestors up to the private app-created archive root. */
export async function verifyPrivateDriveFolder(request, folderId, ownerId) {
  if (!folderId || !ownerId) throw new Error('Drive folder and owner are required');
  const checked = new Set();
  let id = folderId;
  while (id) {
    if (checked.has(id) || checked.size >= 100) throw new Error('Invalid Drive folder ancestry');
    checked.add(id);
    const url = drive + '/files/' + encodeURIComponent(id);
    const info = await request(url + '?fields=id,mimeType,parents,trashed,driveId,ownedByMe,shared,appProperties', { redirect: 'error' });
    if (!info.ok) throw new Error('Drive folder unavailable');
    const folder = await info.json();
    if (folder.id !== id || folder.trashed || folder.driveId || folder.ownedByMe !== true ||
        folder.mimeType !== 'application/vnd.google-apps.folder' || (folder.parents?.length ?? 0) > 1) {
      throw new Error('Drive folder is outside the private account');
    }
    await verifyOwnerPermissions(request, url, ownerId);
    // drive.file may hide My Drive itself. Verify the marked archive's sharing
    // and explicit permissions before stopping at this app-owned boundary.
    if (['archive-v1', 'staging-v1'].includes(folder.appProperties?.mapsilipBackupRoot)) {
      if (folder.shared !== false) throw new Error('Drive archive root is shared or sharing is unknown');
      break;
    }
    id = folder.parents?.[0];
  }
  return checked;
}

async function verifyOwnerPermissions(request, url, ownerId) {
  let pageToken;
  let ownerSeen = false;
  const seenPages = new Set();
  do {
    if (seenPages.has(pageToken)) throw new Error('Invalid Drive permissions pagination');
    seenPages.add(pageToken);
    const query = new URLSearchParams({ fields: 'nextPageToken,permissions(id,type,role,deleted)', pageSize: '100' });
    if (pageToken) query.set('pageToken', pageToken);
    const response = await request(url + '/permissions?' + query, { redirect: 'error' });
    if (!response.ok) throw new Error('Drive folder permissions unavailable');
    const page = await response.json();
    if (!Array.isArray(page.permissions)) throw new Error('Incomplete Drive permissions');
    for (const permission of page.permissions) {
      if (permission.deleted) continue;
      if (permission.type !== 'user' || permission.id !== ownerId || permission.role !== 'owner') {
        throw new Error('Drive folder is shared');
      }
      ownerSeen = true;
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  if (!ownerSeen) throw new Error('Drive folder owner could not be verified');
}

/** Google serves the bytes to its authenticated browser user, including large/resumed downloads. */
export async function privatePackageDownload(request, artifact) {
  const url = drive + '/files/' + encodeURIComponent(artifact.drive_id);
  const fields = 'id,name,mimeType,parents,ownedByMe,driveId,trashed,size,sha256Checksum,capabilities(canDownload),webContentLink';
  const response = await request(url + '?fields=' + fields, { redirect: 'error' });
  if (!response.ok) throw new Error('Drive file unavailable');
  const file = await response.json();
  const mimeType = artifact.name.endsWith('.zip') ? 'application/zip' : 'application/json';
  if (file.id !== artifact.drive_id || file.name !== artifact.name || file.mimeType !== mimeType ||
      file.ownedByMe !== true || file.trashed !== false || file.driveId || !file.capabilities?.canDownload ||
      file.parents?.length !== 1 || file.parents[0] !== artifact.parent_id ||
      file.sha256Checksum !== artifact.sha256 || file.size !== String(artifact.verified_bytes)) {
    throw new Error('Verified Drive package changed or unavailable');
  }
  await verifyOwnerPermissions(request, url, artifact.account_id);
  const ancestors = await verifyPrivateDriveFolder(request, artifact.parent_id, artifact.account_id);
  if (!ancestors.has(artifact.root_id)) throw new Error('File outside archive root');
  const link = new URL(file.webContentLink);
  if (!['https://drive.google.com','https://drive.usercontent.google.com'].includes(link.origin) ||
      link.username || link.password) throw new Error('Unexpected Drive download origin');
  return link.href;
}

export async function ensureDriveFolder(request, { id, parentId, logicalId, name, ownerId }) {
  await verifyPrivateDriveFolder(request, parentId, ownerId);
  const url = drive + '/files/' + encodeURIComponent(id) + '?fields=id,mimeType,parents,appProperties,trashed';
  let response = await request(url, { redirect: 'error' });
  if (response.status === 404) {
    const created = await request(drive + '/files', {
      method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, parents: [parentId], mimeType: 'application/vnd.google-apps.folder',
        appProperties: { archiveFolder: logicalId } }),
    });
    if (!created.ok && created.status !== 409) throw new Error('Drive folder creation failed');
    response = await request(url, { redirect: 'error' });
  }
  if (!response.ok) throw new Error('Drive folder readback failed');
  const folder = await response.json();
  if (folder.id !== id || folder.trashed || folder.mimeType !== 'application/vnd.google-apps.folder' ||
      folder.parents?.length !== 1 || folder.parents[0] !== parentId || folder.appProperties?.archiveFolder !== logicalId) {
    throw new Error('Drive reserved folder identity mismatch');
  }
  await verifyPrivateDriveFolder(request, id, ownerId);
  return { id, webViewLink: 'https://drive.google.com/drive/folders/' + encodeURIComponent(id) };
}

/** Bootstrap a top-level app-owned archive using a durably reserved ID. */
export async function ensureDriveArchiveRoot(request, { id, ownerId }) {
  const url = drive + '/files/' + encodeURIComponent(id) + '?fields=id,mimeType,appProperties,trashed';
  let response = await request(url, { redirect: 'error' });
  if (response.status === 404) {
    const created = await request(drive + '/files', {
      method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: 'MapSilip_Master_Archive', mimeType: 'application/vnd.google-apps.folder',
        appProperties: { mapsilipBackupRoot: 'archive-v1' } }),
    });
    if (!created.ok && created.status !== 409) throw new Error('Drive archive root creation failed');
    response = await request(url, { redirect: 'error' });
  }
  if (!response.ok) throw new Error('Drive archive root unavailable');
  const file = await response.json();
  if (file.id !== id || file.trashed || file.mimeType !== 'application/vnd.google-apps.folder' ||
      !['archive-v1', 'staging-v1'].includes(file.appProperties?.mapsilipBackupRoot)) throw new Error('Drive archive root identity mismatch');
  await verifyPrivateDriveFolder(request, id, ownerId);
  return id;
}
