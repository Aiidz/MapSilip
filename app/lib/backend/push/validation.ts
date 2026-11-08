import { BackendError } from '../security';

import { pushCategories as categories, type PushCategory, type PushPreferences, type PushSubscriptionInput } from '../../pwa/push-contract';
export { categories };
export type { PushPreferences, PushSubscriptionInput };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BackendError('invalid_input');
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, fields: readonly string[]) {
  if (Object.keys(value).length !== fields.length || Object.keys(value).some(key => !fields.includes(key))) throw new BackendError('invalid_input');
}
export function validatePreferences(value: unknown): PushPreferences {
  const input = object(value); exact(input, ['enabled', 'categories']);
  const selected = object(input.categories); exact(selected, categories);
  if (typeof input.enabled !== 'boolean' || categories.some(category => typeof selected[category] !== 'boolean') ||
      (input.enabled && !categories.some(category => selected[category]))) throw new BackendError('invalid_input');
  return { enabled: input.enabled, categories: Object.fromEntries(categories.map(category => [category, selected[category]])) as Record<PushCategory, boolean> };
}
export function validateSubscription(value: unknown): PushSubscriptionInput {
  const input = object(value); exact(input, ['endpoint', 'keys']);
  const keys = object(input.keys); exact(keys, ['p256dh', 'auth']);
  if (typeof input.endpoint !== 'string' || input.endpoint.length > 4096) throw new BackendError('invalid_input');
  let url: URL;
  try { url = new URL(input.endpoint); } catch { throw new BackendError('invalid_input'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash ||
      !['fcm.googleapis.com', 'web.push.apple.com'].includes(url.hostname) || url.href !== input.endpoint) throw new BackendError('invalid_input');
  for (const [key, size] of [['p256dh', 65], ['auth', 16]] as const) {
    const value = keys[key];
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new BackendError('invalid_input');
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.length !== size || bytes.toString('base64url') !== value || (key === 'p256dh' && bytes[0] !== 4)) throw new BackendError('invalid_input');
  }
  return { endpoint: input.endpoint, keys: keys as PushSubscriptionInput['keys'] };
}
export function validateEnrollment(value: unknown) {
  const input = object(value);
  exact(input, 'initialPreferences' in input ? ['subscription', 'initialPreferences'] : ['subscription']);
  const subscription = validateSubscription(input.subscription);
  if (!('initialPreferences' in input)) return { subscription };
  const initialPreferences = validatePreferences(input.initialPreferences);
  if (!initialPreferences.enabled) throw new BackendError('invalid_input');
  return { subscription, initialPreferences };
}
