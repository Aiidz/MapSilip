import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { createStaffAuthDependencies, assertRequestOrigin, getTrustedClientAddress } from '@/app/lib/backend/auth/dependencies';
import { assertStaffAuthEnabled } from '@/app/lib/backend/auth/activation';
import { authResponseBody, applyAuthCookies, logAuthDiagnostic, noStoreHeaders, parseAuthMutation, safeAuthError } from '@/app/lib/backend/auth/http';
import { completeFirstLogin } from '@/app/lib/backend/auth/service';
import type { BackendErrorStage } from '@/app/lib/backend/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let stage: BackendErrorStage = 'first_login_feature_gate';
  try {
    assertStaffAuthEnabled();
    stage = 'first_login_origin';
    assertRequestOrigin(request);
    stage = 'first_login_input';
    const input = await parseAuthMutation(request, ['currentPassword', 'newPassword']);
    stage = 'first_login_client_address';
    const clientAddress = getTrustedClientAddress(request);
    stage = 'first_login_dependencies';
    const cookieStore = await cookies();
    const dependencies = await createStaffAuthDependencies(cookieStore.getAll().map(({ name, value }) => ({ name, value })));
    stage = 'first_login_completion';
    const result = await completeFirstLogin(dependencies, { ...input, clientAddress });
    const response = NextResponse.json(authResponseBody(result), { headers: noStoreHeaders() });
    stage = 'first_login_cookie';
    await applyAuthCookies(response, result, dependencies.revokeSessionAdmission);
    return response;
  } catch (error) {
    logAuthDiagnostic(stage, error);
    return safeAuthError(error, stage);
  }
}
