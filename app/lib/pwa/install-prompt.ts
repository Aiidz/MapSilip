export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

// Browser capability only, never account/session data. Survives client-side login navigation.
let pending: InstallPromptEvent | null = null;
export function getInstallPrompt() { return pending; }
export function takeInstallPrompt() { const event = pending; pending = null; return event; }
export function listenForInstallPrompt(target: EventTarget) {
  const capture = (event: Event) => { event.preventDefault(); pending = event as InstallPromptEvent; };
  const installed = () => { pending = null; };
  target.addEventListener('beforeinstallprompt', capture);
  target.addEventListener('appinstalled', installed);
  return () => { target.removeEventListener('beforeinstallprompt', capture); target.removeEventListener('appinstalled', installed); };
}
