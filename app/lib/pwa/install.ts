/** Installation is independent of notification permission and push configuration. */
export function canInviteInstall(input: {
  authenticated: boolean; width: number; mobile: boolean; coarse: boolean;
  tablet: boolean; standalone: boolean; dismissedUntil: number; now: number;
}) {
  return input.authenticated && input.width <= 767 && input.mobile && input.coarse &&
    !input.tablet && !input.standalone && input.dismissedUntil <= input.now;
}

type StorageReader = Pick<Storage, 'getItem'>;
type StorageWriter = Pick<Storage, 'setItem'>;
const cooldown = 7 * 86400000;
const storageKey = (userId: string) => `mapsilip.install.v1:${userId}`;
export function readDismissal(storage: StorageReader, userId: string, now: number) {
  try {
    const value = JSON.parse(storage.getItem(storageKey(userId)) ?? 'null');
    return value?.version === 1 && Number.isFinite(value.dismissedUntil) && value.dismissedUntil > now
      ? value.dismissedUntil as number : 0;
  } catch { return 0; }
}
export function dismissInstall(storage: StorageWriter, userId: string, now: number) {
  const dismissedUntil = now + cooldown;
  try { storage.setItem(storageKey(userId), JSON.stringify({ version: 1, dismissedUntil })); } catch { /* Session dismissal is managed by the caller. */ }
  return dismissedUntil;
}
