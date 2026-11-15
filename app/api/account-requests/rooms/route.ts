import { NextResponse } from 'next/server';
import { getSecurityExecutor } from '@/app/lib/backend/auth/executor';
import { publicBackendError } from '@/app/lib/backend/security';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const executor = await getSecurityExecutor();
    return NextResponse.json({ rooms: await executor.applicantRoomCatalog() }, { headers: { 'Cache-Control': 'public, max-age=15, s-maxage=15' } });
  } catch (error) {
    const safe = publicBackendError(error);
    return NextResponse.json({ message: safe.message }, { status: safe.status, headers: { 'Cache-Control': 'no-store' } });
  }
}
