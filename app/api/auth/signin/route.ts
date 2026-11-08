import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { createStaffAuthDependencies, assertRequestOrigin, getTrustedClientAddress } from '@/app/lib/backend/auth/dependencies';
import { isStaffAuthEnabled } from '@/app/lib/backend/auth/activation';
import { isTenantAuthEnabled, assertTenantAuthEnabled } from '@/app/lib/backend/tenant-activation';
import { authResponseBody, applyAuthCookies, noStoreHeaders, parseAuthMutation, safeAuthError } from '@/app/lib/backend/auth/http';
import { staffSignIn } from '@/app/lib/backend/auth/service';
import { tenantSignIn } from '@/app/lib/backend/tenant-auth';
import { BackendError, type BackendErrorStage } from '@/app/lib/backend/security';
import { logAuthDiagnostic } from '@/app/lib/backend/auth/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let stage: BackendErrorStage = 'request_origin';
  try {
    assertRequestOrigin(request);
    stage = 'input_validation';
    const input = await parseAuthMutation(request, ['email', 'password']);
    let staffDependencies: Awaited<ReturnType<typeof createStaffAuthDependencies>> | undefined;
    if (isStaffAuthEnabled()) {
      stage = 'staff_dependencies';
      const address = getTrustedClientAddress(request);
      const cookieStore = await cookies();
      staffDependencies = await createStaffAuthDependencies(cookieStore.getAll().map(({ name, value }) => ({ name, value })));
      stage = 'staff_signin';
      const result = await staffSignIn(staffDependencies, { ...input, clientAddress: address });
      if (result.kind !== 'unmapped') {
        const response = NextResponse.json(authResponseBody(result), { headers: noStoreHeaders() });
        stage = 'session_cookie';
        await applyAuthCookies(response, result, staffDependencies.revokeSessionAdmission);
        return response;
      }
    }
    stage = 'feature_gate';
    assertTenantAuthEnabled();
    stage = 'tenant_signin';
    const tenantResult = await tenantSignIn(input.email.toLowerCase(), input.password);
    return NextResponse.json(tenantResult, { headers: noStoreHeaders() });
  } catch (error) {
    logAuthDiagnostic(stage, error);
    if (!isStaffAuthEnabled() && !isTenantAuthEnabled()) return safeAuthError(new BackendError('unavailable'));
    return safeAuthError(error, stage);
  }
}
