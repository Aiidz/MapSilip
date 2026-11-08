import { NextResponse, type NextRequest } from 'next/server';
import { verifyAuthSession } from '@/app/lib/backend/identity';
import { BackendError, publicBackendError } from '@/app/lib/backend/security';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    const roomId = request.nextUrl.searchParams.get('roomId');
    if (!roomId || !uuidPattern.test(roomId)) throw new BackendError('invalid_input');
    const client = await createSupabaseServerClient();
    await verifyAuthSession(client.auth);
    const { data, error } = await client.rpc('mapsilip_room_context', { p_room_id: roomId });
    if (error) {
      if (error.code === '42501') throw new BackendError('forbidden');
      if (error.code === 'P0002') throw new BackendError('invalid_input');
      throw new BackendError('unavailable');
    }
    if (!data || typeof data !== 'object') throw new BackendError('unavailable');
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const safe = publicBackendError(error);
    return NextResponse.json({ error: safe.code, message: safe.message },
      { status: safe.status, headers: { 'Cache-Control': 'no-store' } });
  }
}
