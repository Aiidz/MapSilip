import 'server-only';
import { createSupabaseServerClient } from '../../supabase/server';
import { BackendError } from '../security';
import { resolvePushIdentity } from './identity';
import { pushAvailable } from './config';
import { withinBudget } from './budget';

export class PushConflict extends Error {}
function throwPushError(code: string): never {
  if (code === 'P0409') throw new PushConflict();
  throw new BackendError(code === '42501' ? 'forbidden' : code === '22023' ? 'invalid_input' : code === 'P0429' ? 'rate_limited' : 'unavailable');
}
function unwrap(data: unknown, error: { code?: string } | null) {
  if (error) throwPushError(error.code ?? '55000');
  if (data && typeof data === 'object' && 'push_error' in data) throwPushError(String(data.push_error));
  return data;
}
/** Separate committed RPC for failures rejected before a mutating RPC can run. */
export async function recordRejectedPushAttempt(kind: 'subscription' | 'preferences', signal?: AbortSignal) {
  if (!pushAvailable()) return;
  const client = await createSupabaseServerClient();
  const result = await withinBudget(async innerSignal => {
    const claims = await client.auth.getClaims();
    // Anonymous/invalid JWTs have no account quota. Keep their original auth/input response.
    if (claims.error || typeof claims.data?.claims?.sub !== 'string') return null;
    return await client.rpc('mapsilip_push_record_rejection', { p_kind: kind })
      .abortSignal(signal ? AbortSignal.any([signal, innerSignal]) : innerSignal);
  }, 1000);
  if (result) unwrap(result.data, result.error);
}
export async function userPushRpc(name: 'mapsilip_push_device_get' | 'mapsilip_push_preferences_get' | 'mapsilip_push_preferences_set' |
  'mapsilip_push_subscription_upsert' | 'mapsilip_push_subscription_revoke', args?: Record<string, unknown>, signal?: AbortSignal) {
  try { await resolvePushIdentity(); }
  catch (error) {
    if (name !== 'mapsilip_push_preferences_get' && name !== 'mapsilip_push_device_get') await recordRejectedPushAttempt(name === 'mapsilip_push_preferences_set' ? 'preferences' : 'subscription', signal);
    throw error;
  }
  const client = await createSupabaseServerClient();
  const query = client.rpc(name, args);
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  return unwrap(data, error);
}
