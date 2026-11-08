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
    if (Number(request.headers.get('content-length')) > 2_200_000) throw new BackendError('invalid_input');
    const form = await request.formData();
    const file = form.get('file');
    const purpose = form.get('purpose');
    if (!(file instanceof File) || !['payment','maintenance','profile'].includes(String(purpose)) ||
        (purpose === 'profile' && !['image/jpeg','image/png'].includes(file.type)) ||
        !['image/jpeg','image/png','application/pdf'].includes(file.type) || file.size < 1 || file.size > 2_097_152) {
      throw new BackendError('invalid_input');
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const valid = file.type === 'image/png' ? bytes.length > 8 && bytes.slice(0,8).join(',') === '137,80,78,71,13,10,26,10'
      : file.type === 'application/pdf' ? bytes.length > 4 && String.fromCharCode(...bytes.slice(0,5)) === '%PDF-'
      : bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!valid) throw new BackendError('invalid_input');
    const client = await createSupabaseServerClient();
    await verifyAuthSession(client.auth);
    const { data: metadata, error: metadataError } = await client.rpc('mapsilip_operate', {
      p_action: 'attachment.begin', p_data: { purpose, mime_type: file.type, byte_size: file.size },
    });
    if (metadataError || !metadata?.path || !metadata?.id) throw new BackendError('forbidden');
    const { error } = await client.storage.from(bucket).upload(metadata.path, bytes, { contentType: file.type, upsert: false });
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
      .select('path,mime_type').eq('id', id).maybeSingle();
    if (metadataError || !attachment) throw new BackendError('forbidden');
    const { data, error } = await client.storage.from(bucket).download(attachment.path);
    if (error || !data) throw new BackendError('forbidden');
    return new NextResponse(data, { headers: { 'Content-Type': attachment.mime_type,
      'Content-Disposition': 'attachment', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    const safe = publicBackendError(error);
    return NextResponse.json({ error: safe.code, message: safe.message }, { status: safe.status });
  }
}
