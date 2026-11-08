import { NextResponse } from 'next/server';
import { defaultPushPreferences } from '@/app/lib/pwa/push-contract';
import { pushAvailable } from '@/app/lib/backend/push/config';
import { userPushRpc } from '@/app/lib/backend/push/repository';
import { assertPushMutation, pushError, pushHeaders } from '@/app/lib/backend/push/http';
export const runtime = 'nodejs';
export async function GET() {
  if (!pushAvailable()) return NextResponse.json({ available: false, initialized: false, preferences: defaultPushPreferences }, { headers: pushHeaders });
  try { return NextResponse.json(await userPushRpc('mapsilip_push_preferences_get'), { headers: pushHeaders }); }
  catch (error) { return pushError(error); }
}
export async function PATCH(request: Request) {
  try {
    assertPushMutation(request);
    return NextResponse.json({ error: 'device_settings_only' }, { status: 405, headers: { ...pushHeaders, Allow: 'GET' } });
  } catch (error) { return pushError(error); }
}
