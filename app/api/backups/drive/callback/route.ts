import { NextResponse } from 'next/server';
import { finishDriveConsent } from '@/worker/backup/oauth.mjs';
import { consentStore, driveConfig, saveDriveConnection } from '@/app/lib/backup/connection';
import { requireStaffPortalAccess } from '@/app/lib/backend/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const config = driveConfig();
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
  if (!config) return new NextResponse(null, { status: 503, headers });
  const callback = new URL(config.redirectUri);
  const destination = new URL('/management/backups', callback);
  try {
    const owner = await requireStaffPortalAccess('owner');
    const { searchParams } = new URL(request.url);
    const grant = await finishDriveConsent(config, owner, consentStore, {
      state: searchParams.get('state'),
      code: searchParams.get('code'),
    });
    await saveDriveConnection(owner.userId, grant.accountId, grant.refreshToken);
    destination.searchParams.set('drive', 'connected');
  } catch {
    destination.searchParams.set('drive', 'failed');
  }
  return NextResponse.redirect(destination, { status: 303, headers });
}
