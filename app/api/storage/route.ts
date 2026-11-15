import { removeAuthorizedFile } from '@/app/lib/storage/cleanup';
import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { assertRequestOrigin } from '@/app/lib/backend/auth/dependencies';
import { BackendError, publicBackendError } from '@/app/lib/backend/security';
import { cleanupEnabled, storageCommand, storageEnabled, withStorageOwner } from '@/app/lib/storage/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Cookie' };
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
function failure(error: unknown) {
  const safe = publicBackendError(error);
  return NextResponse.json({ message: !storageEnabled() ? 'Storage management is awaiting its reviewed migration and server activation.' : safe.message, error: safe.code }, { status: safe.status, headers });
}
export async function GET(request: NextRequest) {
  try {
    return await withStorageOwner(async client => {
      const params = Object.fromEntries(request.nextUrl.searchParams);
      const action = params.action || 'inventory'; delete params.action;
      if (!['inventory', 'files', 'history', 'orphans', 'archive.items', 'archive.file', 'records.reviews'].includes(action)) throw new BackendError('invalid_input');
      const result = await storageCommand(client, action, params);
      if (action === 'archive.file') {
        try {
          const payload = result.payload;
          if (payload.bucket_name !== 'mapsilip_evidence' || typeof payload.path !== 'string' || payload.byte_size > 2_097_152) throw new BackendError('invalid_input');
          const downloaded = await client.storage.from(payload.bucket_name).download(payload.path);
          if (downloaded.error || !downloaded.data || downloaded.data.size !== Number(payload.byte_size)) throw new BackendError('unavailable');
          const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
          const checksum = hash(bytes);
          if (payload.checksum_sha256 && payload.checksum_sha256 !== checksum) throw new BackendError('unavailable');
          await storageCommand(client, 'archive.delivered', { ...params, checksum });
          return new NextResponse(bytes, { headers: { ...headers, 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment', 'X-Checksum-Sha256': checksum } });
        } catch (error) {
          await storageCommand(client, 'archive.item_failed', params).catch(() => {});
          throw error;
        }
      }
      if (action === 'archive.items') {
        const delivered = [];
        for (const item of result.items) if (item.kind === 'record') {
          item.checksum_sha256 = hash(JSON.stringify(item.payload));
          delivered.push({ id: item.id, checksum: item.checksum_sha256 });
        }
        if (delivered.length) await storageCommand(client, 'archive.records_delivered', { archive_id: params.archive_id, items: delivered });
      }
      return NextResponse.json({ ...result, cleanup_enabled: cleanupEnabled() }, { headers });
    });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    assertRequestOrigin(request);
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) throw new BackendError('invalid_input');
    // Read at most 16 KiB even if a custom client omits Content-Length.
    if (!request.body) throw new BackendError('invalid_input');
    const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 16384) { await reader.cancel(); throw new BackendError('invalid_input'); } chunks.push(part.value); }
    } finally { reader.releaseLock(); }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new BackendError('invalid_input'); }
    if (!body || typeof body.action !== 'string' || !body.data || typeof body.data !== 'object' || Array.isArray(body.data)) throw new BackendError('invalid_input');
    const allowed = ['archive.create', 'archive.retry', 'archive.ack', 'archive.confirm', 'archive.failed', 'review', 'review.record', 'settings', 'remind', 'cleanup', 'cleanup.cancel'];
    if (!allowed.includes(body.action)) throw new BackendError('invalid_input');
    return await withStorageOwner(async client => {
      if (body.action === 'cleanup') {
        if (!cleanupEnabled()) throw new BackendError('forbidden');
        await removeAuthorizedFile(client, body.data);
        return NextResponse.json({ ok: true }, { headers });
      }
      return NextResponse.json(await storageCommand(client, body.action, body.data), { headers });
    });
  } catch (error) { return failure(error); }
}
