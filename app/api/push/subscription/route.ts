import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { pushAvailable } from '@/app/lib/backend/push/config';
import { validateEnrollment } from '@/app/lib/backend/push/validation';
import { recordRejectedPushAttempt, userPushRpc } from '@/app/lib/backend/push/repository';
import { assertPushMutation, pushError, pushHeaders, readPushJson } from '@/app/lib/backend/push/http';
export const runtime = 'nodejs';
const deviceCookie = 'mapsilip_push_device';
export async function GET() {
  if (!pushAvailable()) return NextResponse.json({ available: false, enrolled: false }, { headers: pushHeaders });
  try {
    const capability = (await cookies()).get(deviceCookie)?.value;
    return NextResponse.json(await userPushRpc('mapsilip_push_device_get', { p_capability: capability ?? null }), { headers: pushHeaders });
  } catch (error) { return pushError(error); }
}

export async function POST(request: Request) {
  let originChecked = false; let reachedRpc = false;
  try {
    assertPushMutation(request);
    originChecked = true;
    const enrollment = validateEnrollment(await readPushJson(request));
    const store = await cookies();
    const saved = store.get(deviceCookie)?.value;
    const capability = saved && /^[a-f0-9]{64}$/.test(saved) ? saved : randomBytes(32).toString('hex');
    reachedRpc = true;
    const result = await userPushRpc('mapsilip_push_subscription_upsert', {
      p_subscription: enrollment.subscription, p_capability: capability, p_initial_preferences: enrollment.initialPreferences ?? null,
    });
    const response = NextResponse.json(result, { headers: pushHeaders });
    response.cookies.set(deviceCookie, capability, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 365 * 86400 });
    return response;
  } catch (error) {
    if (originChecked && !reachedRpc) {
      try { await recordRejectedPushAttempt('subscription'); } catch (rateError) { return pushError(rateError); }
    }
    return pushError(error);
  }
}
export async function DELETE(request: Request) {
  let originChecked = false; let reachedRpc = false;
  try {
    assertPushMutation(request);
    originChecked = true;
    const capability = (await cookies()).get(deviceCookie)?.value;
    if (!capability) return NextResponse.json({ disabled: true }, { headers: pushHeaders });
    reachedRpc = true;
    return NextResponse.json(await userPushRpc('mapsilip_push_subscription_revoke', { p_capability: capability }), { headers: pushHeaders });
  } catch (error) {
    if (originChecked && !reachedRpc) {
      try { await recordRejectedPushAttempt('subscription'); } catch (rateError) { return pushError(rateError); }
    }
    return pushError(error);
  }
}
