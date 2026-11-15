import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';
import { verifyAuthSession } from '@/app/lib/backend/identity';
import { publicBackendError } from '@/app/lib/backend/security';
import { requireStaffAccess } from '@/app/lib/backend/server';
import { assertStaffAuthEnabled } from '@/app/lib/backend/auth/activation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const userIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    const client = await createSupabaseServerClient();
    const requestedUserId = request.nextUrl.searchParams.get('userId');
    let userId: string;
    if (requestedUserId) {
      if (!userIdPattern.test(requestedUserId)) return NextResponse.json({ error: 'invalid_input' }, { status: 400, headers: { 'Cache-Control': 'private, no-store' } });
      assertStaffAuthEnabled();
      await requireStaffAccess('staff.access.inspect');
      userId = requestedUserId;
    } else userId = (await verifyAuthSession(client.auth)).identity.userId;
    let photoQuery = client.from('attachments')
      .select('path,mime_type').eq('uploader_id', userId)
      .eq('purpose', 'profile').in('mime_type', ['image/jpeg', 'image/png'])
      .order('created_at', { ascending: false }).limit(10);
    if (process.env.STORAGE_MANAGEMENT_ENABLED === 'true') photoQuery = photoQuery.neq('lifecycle_status', 'deleted').or('upload_state.eq.uploaded,legacy_upload.eq.true');
    const { data: photos, error } = await photoQuery;
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
