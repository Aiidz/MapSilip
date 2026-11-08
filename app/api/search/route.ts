import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';
import { verifyAuthSession } from '@/app/lib/backend/identity';
import { BackendError, publicBackendError } from '@/app/lib/backend/security';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const query = (request.nextUrl.searchParams.get('q') ?? '').trim();
    if (query.length < 2 || query.length > 80 || /[%_\\]/.test(query)) throw new BackendError('invalid_input');
    const client = await createSupabaseServerClient();
    await verifyAuthSession(client.auth);
    const [rooms,tenants,maintenance] = await Promise.all([
      client.from('rooms').select('id,room_number').ilike('room_number',`%${query}%`).limit(5),
      client.from('tenant_profiles').select('user_id,display_name').ilike('display_name',`%${query}%`).limit(5),
      client.from('maintenance_requests').select('id,category').ilike('category',`%${query}%`).limit(5),
    ]);
    if (rooms.error || tenants.error || maintenance.error) throw new BackendError('unavailable');
    return NextResponse.json({ results: [
      ...(rooms.data ?? []).map(row => ({ title:`Room ${row.room_number}`,href:'/management/rooms' })),
      ...(tenants.data ?? []).map(row => ({ title:row.display_name,href:`/management/rooms?view=tenants&tenant=${encodeURIComponent(row.user_id)}` })),
      ...(maintenance.data ?? []).map(row => ({ title:row.category,href:'/management/maintenance' })),
    ] }, { headers:{ 'Cache-Control':'no-store' } });
  } catch (error) {
    const safe=publicBackendError(error);
    return NextResponse.json({ error:safe.code },{ status:safe.status });
  }
}
