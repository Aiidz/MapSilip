import { NextResponse } from 'next/server';
import { resolvePushIdentity } from '@/app/lib/backend/push/identity';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';
import { BackendError } from '@/app/lib/backend/security';
import { getTrustedAppOrigin } from '@/app/lib/backend/auth/dependencies';
import { noticeContinuation, safeNoticeDestination } from '@/app/lib/pwa/notification-navigation';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!noticeContinuation(id)) return new NextResponse(null, { status: 404, headers });
  try {
    const origin = getTrustedAppOrigin();
    const actor = await resolvePushIdentity();
    const client = await createSupabaseServerClient();
    const { data, error } = await client.from('notifications').select('href').eq('id', id!).eq('recipient_id', actor.userId).maybeSingle();
    if (error) throw new BackendError('unavailable');
    const destination = data && safeNoticeDestination(data.href, actor.role);
    if (!destination) return new NextResponse(null, { status: 404, headers });
    return NextResponse.redirect(new URL(destination, origin), { status: 303, headers });
  } catch (error) {
    if (error instanceof BackendError && error.code === 'unauthenticated') {
      return NextResponse.redirect(new URL(`/login?notice=${id}`, getTrustedAppOrigin()), { status: 303, headers });
    }
    return new NextResponse(null, { status: error instanceof BackendError && error.code === 'forbidden' ? 404 : 503, headers });
  }
}
