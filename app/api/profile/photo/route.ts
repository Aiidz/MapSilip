import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';
import { verifyAuthSession } from '@/app/lib/backend/identity';
import { publicBackendError } from '@/app/lib/backend/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const client = await createSupabaseServerClient();
    const session = await verifyAuthSession(client.auth);
    const { data: photos, error } = await client.from('attachments')
      .select('path,mime_type').eq('uploader_id', session.identity.userId)
      .eq('purpose', 'profile').in('mime_type', ['image/jpeg', 'image/png'])
      .order('created_at', { ascending: false }).limit(10);
    if (error) throw error;
    for (const photo of photos ?? []) {
      const { data, error: downloadError } = await client.storage.from('mapsilip_evidence').download(photo.path);
      if (downloadError || !data) continue;
      return new NextResponse(data, { headers: {
        'Content-Type': photo.mime_type,
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      } });
    }
    return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const safe = publicBackendError(error);
    return NextResponse.json({ error: safe.code }, { status: safe.status, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
