import { createHmac } from 'node:crypto';
import { BackendError } from '../backend/security';

/** Private server-only key; never send it in a response or NEXT_PUBLIC variable. */
export function storageReceipt(parts: (string | number | null | undefined)[]) {
  const key = process.env.STORAGE_RECEIPT_SECRET;
  if (!key || !/^[a-f0-9]{64}$/.test(key)) throw new BackendError('unavailable');
  return createHmac('sha256', key).update(parts.map(value => value ?? '').join('|')).digest('hex');
}
