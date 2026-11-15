import type { SupabaseClient } from '@supabase/supabase-js';

/** A failed business submission never implies permission to delete its uploaded evidence. */
export async function recordAttachmentLinkFailure(client: SupabaseClient, id: unknown) {
  if (process.env.STORAGE_MANAGEMENT_ENABLED !== 'true' || typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return;
  const result = await client.rpc('mapsilip_storage_link_failure', { p_id: id });
  if (result.error) console.error('storage_link_failure_recording_failed', { attachmentId: id });
}
