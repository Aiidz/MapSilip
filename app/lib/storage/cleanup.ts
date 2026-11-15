import type { SupabaseClient } from '@supabase/supabase-js';
import { BackendError } from '../backend/security';
import { storageCommand } from './server';

/** Called only after the route verifies owner authority and explicit cleanup activation. */
export async function removeAuthorizedFile(client: SupabaseClient, data: Record<string, unknown>) {
  const id = data.attachment_id;
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || data.confirmation !== id) throw new BackendError('invalid_input');
  const claim = await storageCommand(client, 'cleanup.claim', data);
  if (claim.deleted === true) return;
  try {
    // Never accept a bucket or object path supplied by the browser or an unexpected claim.
    const parts = typeof claim.path === 'string' ? claim.path.split('/') : [];
    if (claim.bucket !== 'mapsilip_evidence' || parts.length !== 2 || !/^[0-9a-f-]{36}$/i.test(parts[0]) || parts[1] !== id) throw new BackendError('unavailable');
    const removed = await client.storage.from(claim.bucket).remove([claim.path]);
    if (removed.error) throw new BackendError('unavailable');
    const info = await client.storage.from(claim.bucket).info(claim.path);
    if (!info.error || !['404', 'not_found'].includes(String(info.error.statusCode))) throw new BackendError('unavailable');
    await storageCommand(client, 'cleanup.finished', data);
  } catch (error) {
    await storageCommand(client, 'cleanup.failed', data).catch(() => {});
    throw error;
  }
}
