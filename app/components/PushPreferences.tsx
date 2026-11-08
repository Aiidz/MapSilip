'use client';

import { useEffect, useState } from 'react';
import { defaultPushPreferences, type PushPreferenceState, type PushSubscriptionInput } from '../lib/pwa/push-contract';
import { decodeVapidKey, enrollmentBody, requestPushConsent } from '../lib/pwa/enrollment';

type DeviceState = PushPreferenceState & { enrolled: boolean };

export function PushPreferences({ active, available, ios, standalone }: { active: boolean; available: boolean; ios: boolean; standalone: boolean }) {
  const [state, setState] = useState<DeviceState | null>(null);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>(() => typeof Notification === 'undefined' ? 'default' : Notification.permission);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [enrolled, setEnrolled] = useState(false);
  const supported = typeof window !== 'undefined' && 'Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator && (!ios || standalone);

  useEffect(() => {
    if (!active || !available || !supported) return;
    let alive = true; const controller = new AbortController();
    void fetch('/api/push/subscription', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) throw Error();
      const saved = await response.json() as DeviceState;
      if (alive) { setState(saved); setEnrolled(saved.enrolled); setPermission(Notification.permission); }
    }).catch(() => { if (alive) setMessage('Notification settings are unavailable. Try opening this panel again later.'); });
    // Never wait on readiness before requesting permission in the click handler.
    void navigator.serviceWorker.ready.then(ready => {
      if (!alive) return;
      setRegistration(ready);
    }).catch(() => {});
    const refreshPermission = () => {
      if (document.visibilityState === 'visible') setPermission(Notification.permission);
    };
    document.addEventListener('visibilitychange', refreshPermission);
    return () => { alive = false; controller.abort(); document.removeEventListener('visibilitychange', refreshPermission); };
  }, [active, available, supported]);

  function enable() {
    if (!registration || !state?.available || busy) return;
    // Browser user activation must be consumed before the first await.
    const consent = requestPushConsent(Notification);
    setBusy(true); setMessage('');
    void (async () => {
      const result = await consent; setPermission(result);
      if (result !== 'granted') { setMessage('Notifications are off. You can change permission in browser or device Settings.'); return; }
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY ?? '') });
      async function bind(initialized: boolean) {
        const json = subscription!.toJSON();
        return fetch('/api/push/subscription', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(enrollmentBody({ endpoint: json.endpoint!, keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth } } as PushSubscriptionInput, initialized, defaultPushPreferences)) });
      }
      let initialized = state.initialized;
      let response = await bind(initialized);
      if (response.status === 409) {
        const current = await fetch('/api/push/subscription', { cache: 'no-store' });
        if (!current.ok) throw Error();
        const saved = await current.json() as DeviceState; setState(saved);
        initialized = saved.initialized;
        response = await bind(initialized);
      }
      // A cleared installation cookie must never take over the old endpoint.
      if (response.status === 403) {
        await subscription.unsubscribe();
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY ?? '') });
        response = await bind(initialized);
      }
      if (!response.ok) throw Error();
      const saved = await response.json() as PushPreferenceState; setState({ ...saved, enrolled: true }); setEnrolled(true);
      setMessage('Push notifications are enabled on this device.');
    })().catch(() => setMessage('This device could not be enrolled. Try again or use another supported browser.')).finally(() => setBusy(false));
  }
  async function disableDevice() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/push/subscription', { method: 'DELETE' });
      if (!response.ok) throw Error();
      setEnrolled(false);
      try { const subscription = await registration?.pushManager.getSubscription(); await subscription?.unsubscribe(); } catch { /* Server revocation already prevents delivery. */ }
       setMessage('Push notifications are disabled on this device. Other devices are unchanged.');
    } catch { setMessage('Could not disable this device. Try again.'); }
    finally { setBusy(false); }
  }
  return <section className="pwa-settings" aria-label="Push notification settings">
    <h3>Push notifications</h3>
    <p>Enable or disable push notifications on this device. Your other phones and browsers are managed separately.</p>
    {!available ? <p>Push notifications are not enabled yet. Installing MapSilip remains available.</p> : !supported ? <p>{ios && !standalone ? 'On iPhone, install MapSilip on your Home Screen and open the installed app first. Push requires a supported iOS version (16.4 or later).' : 'This browser does not support push notifications. In-app notifications still work.'}</p> : !state?.available ? <p>Notification enrollment is currently unavailable.</p> : <>
      {permission === 'denied' ? <p>Permission is blocked. Change notification permission in browser or device Settings; MapSilip will not repeatedly prompt.</p> : !enrolled && <button type="button" className="button button--primary"
        disabled={busy || !registration || !process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY} onClick={enable}>{busy ? 'Enabling…' : 'Enable notifications on this device'}</button>}
      {enrolled && <><p>Push notifications are enabled on this device.</p><button type="button" className="button button--secondary" disabled={busy} onClick={() => { void disableDevice(); }}>{busy ? 'Disabling…' : 'Disable notifications on this device'}</button></>}
    </>}
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
