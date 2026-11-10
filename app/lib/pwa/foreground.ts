export const foregroundSettingsEvent = 'mapsilip-foreground-settings-updated';
export const foregroundNotificationReceivedEvent = 'mapsilip-foreground-notification-received';
export function foregroundPreferenceKey(userId: string) { return `mapsilip.foreground.v1:${userId}`; }
export function readForegroundEnabled(storage: Pick<Storage, 'getItem'>, userId: string) {
  try { const value = JSON.parse(storage.getItem(foregroundPreferenceKey(userId)) ?? 'null'); return value?.version === 1 && value.enabled === true; }
  catch { return false; }
}
export function writeForegroundEnabled(storage: Pick<Storage, 'setItem'>, userId: string, enabled: boolean) {
  storage.setItem(foregroundPreferenceKey(userId), JSON.stringify({ version: 1, enabled }));
}
/** Detect the device OS; resizing a desktop window must not enroll it in mobile push. */
export function isMobileNotificationDevice(device: Pick<Navigator, 'userAgent' | 'maxTouchPoints'>) {
  return /Android|iPhone|iPad|iPod/i.test(device.userAgent) || (/Macintosh/.test(device.userAgent) && device.maxTouchPoints > 1);
}
export function createNoticeGuard(userId: string) {
  const seen = new Set<string>();
  return (input: unknown) => {
    if (!input || typeof input !== 'object') return false;
    const value = input as Record<string, unknown>;
    const id = value.id;
    if (value.read_at || value.recipient_id !== userId || typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || seen.has(id)) return false;
    seen.add(id);
    if (seen.size > 100) seen.delete(seen.values().next().value!);
    return true;
  };
}
