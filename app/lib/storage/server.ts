import { storageReceipt } from './receipts';
import { executeStaffOperation } from '../backend/server';
import { BackendError } from '../backend/security';
import type { SupabaseClient } from '@supabase/supabase-js';

export const storageEnabled = () => process.env.STORAGE_MANAGEMENT_ENABLED === 'true';
export const cleanupEnabled = () => storageEnabled() && process.env.STORAGE_CLEANUP_ENABLED === 'true';
export async function withStorageOwner<T>(operation: (client: SupabaseClient) => Promise<T>) {
  if (!storageEnabled()) throw new BackendError('unavailable');
  return executeStaffOperation('finance.read', async client => {
    await storageCommand(client, 'server.check', { proof: storageReceipt(['server-check']) });
    return operation(client);
  });
}
export async function storageCommand(client: SupabaseClient, action: string, data: Record<string, unknown> = {}) {
  if (action === 'archive.delivered') data = { ...data, proof: storageReceipt([action, String(data.archive_id), String(data.item_id), String(data.checksum)]) };
  if (action === 'archive.records_delivered') data = { ...data, items: (data.items as { id: number; checksum: string }[]).map(item => ({ ...item, proof: storageReceipt([action, String(data.archive_id), item.id, item.checksum]) })) };
  const result = action === 'archive.create' && typeof data.category === 'string'
    ? await client.rpc('mapsilip_storage_create_category_archive', { p_scope: data })
    : await client.rpc('mapsilip_storage_manage', { p_action: action, p_data: data });
  if (result.error) throw new BackendError(result.error.code === '42501' ? 'forbidden' : result.error.code === '23514' || result.error.code === '22023' ? 'invalid_input' : 'unavailable');
  return result.data;
}
