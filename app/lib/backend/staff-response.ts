import { publicBackendError } from './security';
import type { StaffActor } from './staff-access';

/** Read-only eligibility probe; returns no identity, session, role or operational records. */
export async function staffAccessResponse(check: () => Promise<StaffActor>) {
  const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' };
  try {
    await check();
    return Response.json({ access: 'granted' }, { headers });
  } catch (error) {
    const result = publicBackendError(error);
    return Response.json({ error: result.code, message: result.message }, { status: result.status, headers });
  }
}
