'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { requestPushConsent } from '../lib/pwa/enrollment';
import { foregroundSettingsEvent, readForegroundEnabled, writeForegroundEnabled } from '../lib/pwa/foreground';

/** Desktop permission only. Never subscribes to Web Push or requires VAPID. */
export function BrowserNotificationSettings({ active, userId, onContinue }: { onContinue?: () => void; active: boolean; userId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  useEffect(() => {
    if (!active || !supported) return;
    const refresh = () => {
      try { setEnabled(readForegroundEnabled(window.localStorage, userId)); } catch { setEnabled(false); }
      setPermission(Notification.permission);
    };
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener(foregroundSettingsEvent, refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener(foregroundSettingsEvent, refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [active, supported, userId]);
  function enable() {
    if (!supported || busy || !userId) return;
    const consent = requestPushConsent(Notification); // Must run directly on the user gesture.
    setBusy(true); setMessage('');
    void (async () => {
      const result = await consent; setPermission(result);
      if (result !== 'granted') { setMessage('Allow notifications in browser settings.'); return; }
      // Migrate an already-enrolled desktop away from background push, without enrolling anything.
      try {
        const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration('/') : undefined;
        const previous = await registration?.pushManager?.getSubscription();
        if (previous) {
          let stopped = false;
          try { stopped = await previous.unsubscribe(); } catch { /* Server revocation can still stop old delivery. */ }
          try { const cleanup = await fetch('/api/push/subscription', { method: 'DELETE' }); stopped ||= cleanup.ok; } catch { /* Browser alerts do not depend on a push server. */ }
          if (!stopped) setMessage('Browser alerts are on. Remove old background alerts in browser settings.');
        }
      } catch { /* Browsers without a working push service can still display ordinary notifications. */ }
      writeForegroundEnabled(window.localStorage, userId, true); setEnabled(true);
      window.dispatchEvent(new Event(foregroundSettingsEvent));
    })().catch(() => setMessage('Couldn’t enable browser alerts. Check browser settings and try again.')).finally(() => setBusy(false));
  }
  function disable() {
    try { writeForegroundEnabled(window.localStorage, userId, false); setEnabled(false); setMessage(''); window.dispatchEvent(new Event(foregroundSettingsEvent)); }
    catch { setMessage('Couldn’t save this setting. Try again.'); }
  }
  return <section className="app-settings-group" aria-label="Browser notification settings">
    <div className="app-settings-row"><span className="app-settings-icon"><Icon name="bell" /></span>
      <div className="app-settings-copy"><h3>Browser notifications</h3><p>Only while MapSilip is open.</p></div>
      <span className="app-settings-badge">{!supported ? 'Unsupported' : permission === 'denied' ? 'Blocked' : enabled && permission === 'granted' ? 'On' : 'Off'}</span>
    </div>
    <div className="app-settings-content">
      {!supported ? <p>Use in-app notifications in this browser.</p> : permission === 'denied' ? <p>Allow notifications in browser settings.</p>
        : enabled && permission === 'granted' && onContinue ? <button type="button" className="button button--primary" onClick={onContinue}>Continue</button> : enabled && permission === 'granted' ? <button type="button" className="button button--secondary" disabled={busy} onClick={disable}>Disable notifications</button>
        : <button type="button" className="button button--primary" disabled={busy || !userId} onClick={enable}>{busy ? 'Enabling…' : 'Enable notifications'}</button>}
      {message && <p role="status">{message}</p>}
    </div>
  </section>;
}
