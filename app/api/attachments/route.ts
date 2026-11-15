import { storageReceipt } from '@/app/lib/storage/receipts';
import { createHash } from 'node:crypto';
import { normalizeUpload, readUploadForm } from '@/app/lib/uploads/server';
import { requireStaffAccess } from '@/app/lib/backend/server';
import { NextResponse, type NextRequest } from 'next/server';
import { assertRequestOrigin } from '@/app/lib/backend/auth/dependencies';
import { verifyAuthSession } from '@/app/lib/backend/identity';
import { BackendError, publicBackendError } from '@/app/lib/backend/security';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';

export const runtime = 'nodejs';
const bucket = 'mapsilip_evidence';

export async function POST(request: NextRequest) {
  try {
    assertRequestOrigin(request);
    const client = await createSupabaseServerClient();
    await verifyAuthSession(client.auth);
    if (process.env.STORAGE_MANAGEMENT_ENABLED === 'true') storageReceipt(['preflight']);
    let form: FormData;
    try { form = await readUploadForm(request); } catch { throw new BackendError('invalid_input'); }
    const file = form.get('file');
    const purpose = form.get('purpose');
    if (!(file instanceof File) || !['payment','maintenance','profile','contract'].includes(String(purpose)) ||
        (purpose === 'profile' && !['image/jpeg','image/png'].includes(file.type)) ||
        !['image/jpeg','image/png','application/pdf'].includes(file.type) || file.size < 1 || file.size > 2_097_152) {
      throw new BackendError('invalid_input');
    }
    if (purpose === 'contract') await requireStaffAccess('tenant.application.approve');
    const extensions: Record<string, RegExp> = { 'image/jpeg': /\.jpe?g$/i, 'image/png': /\.png$/i, 'application/pdf': /\.pdf$/i };
    if (!extensions[file.type]?.test(file.name)) throw new BackendError('invalid_input');
    let normalized: Awaited<ReturnType<typeof normalizeUpload>>;
    try { normalized = await normalizeUpload(new Uint8Array(await file.arrayBuffer()), file.type, String(purpose)); }
    catch { throw new BackendError('invalid_input'); }
    const { data: metadata, error: metadataError } = await client.rpc('mapsilip_operate', {
      p_action: 'attachment.begin', p_data: { purpose, mime_type: normalized.mime, byte_size: normalized.bytes.length },
    });
    if (metadataError || !metadata?.path || !metadata?.id) throw new BackendError('forbidden');
    const { error } = await client.storage.from(bucket).upload(metadata.path, normalized.bytes, { contentType: normalized.mime, upsert: false });
    if (process.env.STORAGE_MANAGEMENT_ENABLED === 'true') {
      const checksum = error ? null : createHash('sha256').update(normalized.bytes).digest('hex');
      const originalName = file.name.slice(0, 240);
      const proof = storageReceipt(['upload', metadata.id, originalName, checksum, String(!error)]);
      const finalized = await client.rpc('mapsilip_storage_upload_result', { p_id: metadata.id, p_name: originalName, p_checksum: checksum, p_success: !error, p_proof: proof });
      if (finalized.error) { console.error('storage_upload_finalize_failed', { attachmentId: metadata.id }); throw new BackendError('unavailable'); }
    }
    if (error) throw new BackendError('unavailable');
    return NextResponse.json({ id: metadata.id }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const safe = publicBackendError(error);
    return NextResponse.json({ error: safe.code, message: safe.message }, { status: safe.status });
  }
}

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id') ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new BackendError('invalid_input');
    const client = await createSupabaseServerClient();
    await verifyAuthSession(client.auth);
    const { data: attachment, error: metadataError } = await client.from('attachments')
      .select(process.env.STORAGE_MANAGEMENT_ENABLED === 'true' ? 'path,mime_type,purpose,lifecycle_status' : 'path,mime_type,purpose').eq('id', id).maybeSingle().returns<{ path: string; mime_type: string; purpose: string; lifecycle_status?: string }>();
    if (metadataError || !attachment) throw new BackendError('forbidden');
    if ('lifecycle_status' in attachment && attachment.lifecycle_status === 'deleted') return NextResponse.json({ message: 'The original file was archived and removed after owner authorization.' }, { status: 410, headers: { 'Cache-Control': 'private, no-store' } });
    const { data, error } = await client.storage.from(bucket).download(attachment.path);
    if (error || !data) throw new BackendError('forbidden');
    return new NextResponse(data, { headers: { 'Content-Type': attachment.mime_type,
      'Content-Disposition': attachment.purpose === 'contract' ? `attachment; filename="rental-contract.${attachment.mime_type === 'application/pdf' ? 'pdf' : attachment.mime_type === 'image/png' ? 'png' : 'jpg'}"` : 'attachment', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    const safe = publicBackendError(error);
    return NextResponse.json({ error: safe.code, message: safe.message }, { status: safe.status });
  }
}

/** Leaving a form never authorizes deleting evidence. Use the audited owner cleanup flow. */
export async function DELETE(request: NextRequest) {
  try {
    assertRequestOrigin(request);
    await requireStaffAccess('tenant.application.approve');
    return NextResponse.json({ message: 'Review this upload in Storage & archives. Archive and owner authorization are required before removal.' }, { status: 409, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const safe = publicBackendError(error);
    return NextResponse.json({ error: safe.code, message: safe.message }, { status: safe.status });
  }
}
