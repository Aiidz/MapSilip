import 'server-only';
import { request } from 'node:https';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { getSupabaseEnvironment } from '../../supabase/env';
import { BackendError } from '../security';
import { validateSubscription } from './validation';
import { isStaffAuthEnabled } from '../auth/activation';
import { isTenantAuthEnabled } from '../tenant-activation';
import { deliveryOutcome, recipientAuthEnabled } from './policy';
import { pushAvailable } from './config';
import { withinBudget } from './budget';
import { assertVapidPair } from './vapid';

type Claim = { id: string; token: string };
type Delivery = Claim & { attempt: number; notificationId: string; category: string; role: string; ttl: number; subscription: unknown };
/** Node HTTPS never follows redirects; responses/bodies contain no application logs. */
async function send(delivery: Delivery, signal: AbortSignal) {
  const subscription = validateSubscription(delivery.subscription);
  const details = webpush.generateRequestDetails(subscription, JSON.stringify({ v: 1, notificationId: delivery.notificationId, category: delivery.category }), {
    TTL: Math.min(3600, delivery.ttl), urgency: 'normal',
    vapidDetails: { subject: process.env.WEB_PUSH_VAPID_SUBJECT!, publicKey: process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY!, privateKey: process.env.WEB_PUSH_VAPID_PRIVATE_KEY! },
  });
  return new Promise<{ status: number; retryAfter: number }>((resolve, reject) => {
    const outgoing = request(details.endpoint, { method: details.method, headers: details.headers, timeout: 5000, signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) }, response => {
      const raw = response.headers['retry-after'];
      const value = Array.isArray(raw) ? raw[0] : raw;
      const retryAfter = value ? (/^\d+$/.test(value) ? Number(value) : Math.max(0, (Date.parse(value) - Date.now()) / 1000)) : 0;
      response.resume();
      resolve({ status: response.statusCode ?? 0, retryAfter: Number.isFinite(retryAfter) ? Math.ceil(retryAfter) : 0 });
    });
    outgoing.on('timeout', () => outgoing.destroy(new Error('push timeout')));
    outgoing.on('error', reject);
    outgoing.end(details.body);
  });
}
// 25s overall (including claim), with 2.5s reserved for one fenced release RPC.
const RPC_MS = 2000;
export async function dispatchPushBatch({ limit = 100 }: { limit?: number } = {}) {
  const deadline = Date.now() + 25000;
  const workDeadline = deadline - 2500;
  if (!pushAvailable()) throw new BackendError('unavailable');
  try {
    assertVapidPair(process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY!, process.env.WEB_PUSH_VAPID_PRIVATE_KEY!);
    webpush.setVapidDetails(process.env.WEB_PUSH_VAPID_SUBJECT!, process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY!, process.env.WEB_PUSH_VAPID_PRIVATE_KEY!);
  } catch { throw new BackendError('unavailable'); }
  const client = createClient(getSupabaseEnvironment().url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  async function rpc(name: string, args: Record<string, unknown>) {
    const result = await withinBudget(signal => client.rpc(name, args).abortSignal(signal), Math.min(RPC_MS, deadline - Date.now()));
    if (result.error) throw new BackendError('unavailable');
    return result.data;
  }
  const totalLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 100;
  const counts = { claimed: 0, accepted: 0, retried: 0, discarded: 0, deferred: 0 };
  // Claim small pages, but drain a burst without waiting for another scheduled invocation.
  for (let round = 0; round < 10 && counts.claimed < totalLimit && workDeadline - Date.now() >= 11000; round++) {
    const claims = await rpc('mapsilip_push_claim', { p_limit: Math.min(totalLimit - counts.claimed, 20) }) as Claim[];
    if (!claims.length) break;
    counts.claimed += claims.length;
    const deferredBefore = counts.deferred;
    const unfinished = new Map(claims.map(claim => [claim.id, { ...claim, sent: false }]));
    try {
      // Reserve check2s + provider5s + finish2s before starting a group. All in-flight jobs settle before cleanup.
      for (let index = 0; index < claims.length && workDeadline - Date.now() >= 9000; index += 4) {
        await Promise.allSettled(claims.slice(index, index + 4).map(async claim => {
          const delivery = await rpc('mapsilip_push_delivery_check', { p_id: claim.id, p_token: claim.token }) as Delivery | { deferred: true } | null;
          if (!delivery) { unfinished.delete(claim.id); counts.discarded++; return; }
          if ('deferred' in delivery) { unfinished.delete(claim.id); counts.deferred++; return; }
          if (!recipientAuthEnabled(delivery.role, { staff: isStaffAuthEnabled(), tenant: isTenantAuthEnabled() })) {
            await rpc('mapsilip_push_finish', { p_id: claim.id, p_token: claim.token, p_outcome: 'discarded', p_status: 0, p_delay: 0 });
            unfinished.delete(claim.id); counts.discarded++; return;
          }
          if (workDeadline - Date.now() < 7000) return;
          let response = { status: 0, retryAfter: 0 };
          try { response = await withinBudget(signal => { unfinished.get(claim.id)!.sent = true; return send(delivery, signal); }, Math.min(5000, workDeadline - Date.now() - RPC_MS)); }
          catch (error) { if (error instanceof BackendError) response.status = 400; }
          const outcome = deliveryOutcome(response.status, delivery.attempt, response.retryAfter);
          await rpc('mapsilip_push_finish', { p_id: claim.id, p_token: claim.token, p_outcome: outcome.kind, p_status: response.status, p_delay: outcome.delaySeconds });
          unfinished.delete(claim.id);
          if (outcome.kind === 'accepted') counts.accepted++;
          else if (outcome.kind === 'retry') counts.retried++;
          else counts.discarded++;
        }));
      }
    } finally {
      counts.deferred += unfinished.size;
      if (unfinished.size) {
        try { await rpc('mapsilip_push_release', { p_claims: [...unfinished.values()] }); }
        catch { /* A timed-out release remains recoverable through the existing60s lease. */ }
      }
    }
    if (counts.deferred > deferredBefore) break;
  }
  return counts;
}
