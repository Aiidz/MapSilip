import { NextResponse } from 'next/server';
import { startDriveConsent } from '@/worker/backup/oauth.mjs';
import { consentStore, driveConfig } from '@/app/lib/backup/connection';
import { assertRequestOrigin } from '@/app/lib/backend/auth/dependencies';
import { requireStaffPortalAccess } from '@/app/lib/backend/server';
import { BackendError, publicBackendError } from '@/app/lib/backend/security';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    assertRequestOrigin(request);
    const owner = await requireStaffPortalAccess('owner');
    const config = driveConfig();
    if (!config) throw new BackendError('unavailable');
    const consent = await startDriveConsent(config, owner, consentStore);
    return NextResponse.redirect(consent, { status: 303, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch (error) {
    const failure = publicBackendError(error);
    return NextResponse.json({ message: failure.message }, { status: failure.status, headers: { 'Cache-Control': 'no-store' } });
  }
}
