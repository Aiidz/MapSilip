/** Local presentation decisions only. Never used for authentication or authorization. */
type Store = Pick<Storage, 'getItem' | 'setItem'>;
const memory = new Map<string, string>();
const prefix = 'mapsilip.onboarding.v1:';
export const onboardingChanged = 'mapsilip-onboarding-changed';
function browserStore(): Store | undefined { try { return window.localStorage; } catch { return undefined; } }
export function readDecision(scope: string, storage = browserStore()): string | null {
  try { const saved = storage?.getItem(prefix + scope); if (saved === 'done' || saved === 'later' || saved === 'enabled') return saved; } catch { /* In-memory fallback for blocked storage. */ }
  return memory.get(scope) ?? null;
}
export function saveDecision(scope: string, decision: 'done' | 'later' | 'enabled', storage = browserStore()) {
  memory.set(scope, decision);
  try { storage?.setItem(prefix + scope, decision); } catch { /* Keep the current-session decision. */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(onboardingChanged));
}
export function setupStage(input: {notificationDone: boolean; installDone: boolean; mobile: boolean; standalone: boolean; installEligible: boolean}): 'notifications' | 'invite' | null {
  if (!input.notificationDone) return 'notifications';
  return input.mobile && !input.standalone && !input.installDone && input.installEligible ? 'invite' : null;
}
