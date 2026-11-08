import { revokePushForCurrentDevice } from '@/app/lib/backend/push/logout';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { createStaffAuthDependencies, assertRequestOrigin } from '@/app/lib/backend/auth/dependencies';
import { assertStaffAuthEnabled } from '@/app/lib/backend/auth/activation';
import { applyAuthCookies, noStoreHeaders, safeAuthError } from '@/app/lib/backend/auth/http';
import { staffSignOut } from '@/app/lib/backend/auth/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    assertStaffAuthEnabled();
    assertRequestOrigin(request);
    await revokePushForCurrentDevice();
    const cookieStore = await cookies();
    const dependencies = await createStaffAuthDependencies(cookieStore.getAll().map(({ name, value }) => ({ name, value })));
    const result = await staffSignOut(dependencies);
    const response = NextResponse.json({ state: result.kind }, { headers: noStoreHeaders() });
    await applyAuthCookies(response, result, dependencies.revokeSessionAdmission);
    return response;
  } catch (error) {
    return safeAuthError(error);
  }
}
