import { NextResponse } from 'next/server';
import { disconnectDrive, driveConfig } from '@/app/lib/backup/connection';
import { assertRequestOrigin } from '@/app/lib/backend/auth/dependencies';
import { requireStaffPortalAccess } from '@/app/lib/backend/server';
import { BackendError, publicBackendError } from '@/app/lib/backend/security';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
  try {
    assertRequestOrigin(request);
    const owner = await requireStaffPortalAccess('owner');
    const config = driveConfig();
    if (!config) throw new BackendError('unavailable');
    await disconnectDrive(owner.userId);
    return NextResponse.redirect(new URL('/management/backups', config.redirectUri), { status: 303, headers });
  } catch (error) {
    const failure = publicBackendError(error);
    return NextResponse.json({ message: failure.message }, { status: failure.status, headers });
  }
}
