import 'server-only';
import { cookies } from 'next/headers';
import { pushAvailable } from './config';
import { userPushRpc } from './repository';

/** Best effort device cleanup; never prevent existing authoritative logout. */
export async function revokePushForCurrentDevice() {
  if (!pushAvailable()) return;
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const cleanup = async () => {
      const capability = (await cookies()).get('mapsilip_push_device')?.value;
      if (capability) await userPushRpc('mapsilip_push_subscription_revoke', { p_capability: capability }, controller.signal);
    };
    await Promise.race([cleanup(), new Promise<void>(resolve => {
      timeout = setTimeout(() => { controller.abort(); resolve(); }, 1500);
    })]);
  } catch { /* Session revocation remains the authority checked by the worker. */ }
  finally { if (timeout) clearTimeout(timeout); }
}
