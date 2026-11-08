import type { PushPreferences, PushSubscriptionInput } from './push-contract';

/** Invoke directly inside a click handler, before any asynchronous work. */
export function requestPushConsent(api: Pick<typeof Notification, 'permission' | 'requestPermission'>): Promise<NotificationPermission> {
  try { return api.permission === 'default' ? api.requestPermission() : Promise.resolve(api.permission); }
  catch (error) { return Promise.reject(error); }
}
export function enrollmentBody(subscription: PushSubscriptionInput, initialized: boolean, preferences: PushPreferences) {
  return initialized ? { subscription } : { subscription, initialPreferences: { ...preferences, enabled: true } };
}
export function decodeVapidKey(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64 + '='.repeat((4 - base64.length % 4) % 4)), char => char.charCodeAt(0));
}
