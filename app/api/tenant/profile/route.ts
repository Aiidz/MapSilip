import { NextResponse } from 'next/server';
import { assertTenantAuthEnabled } from '@/app/lib/backend/tenant-activation';
import { getTenantProfile } from '@/app/lib/backend/tenant';
import { noStoreHeaders, safeAuthError } from '@/app/lib/backend/auth/http';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    assertTenantAuthEnabled();
    const profile = await getTenantProfile();
    return NextResponse.json({ profile: { displayName: profile.displayName, email: profile.email } },
      { headers: noStoreHeaders() });
  } catch (error) {
    return safeAuthError(error);
  }
}
