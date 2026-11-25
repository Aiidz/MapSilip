'use client';

import { useSyncExternalStore } from 'react';
import { isMobileNotificationDevice } from '../lib/pwa/foreground';
import { BrowserNotificationSettings } from './BrowserNotificationSettings';
import { PushPreferences } from './PushPreferences';

const standaloneQuery = '(display-mode: standalone)';
function subscribe(update: () => void) {
  const display = window.matchMedia(standaloneQuery);
  display.addEventListener('change', update);
  window.addEventListener('appinstalled', update);
  return () => {
    display.removeEventListener('change', update);
    window.removeEventListener('appinstalled', update);
  };
}

function deviceSnapshot() {
  if (!isMobileNotificationDevice(navigator)) return 'desktop';
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia(standaloneQuery).matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return ios ? standalone ? 'ios-app' : 'ios-browser' : 'mobile';
}

export function InlineNotificationSettings({ userId, pushEnabled }: { userId: string; pushEnabled: boolean }) {
  const device = useSyncExternalStore(subscribe, deviceSnapshot, () => null);
  return <div className="app-settings preferences-alerts">
    <section className="app-settings-group preferences-alert-status" aria-labelledby="in-app-notification-title">
      <h3 id="in-app-notification-title">In-app notifications</h3>
      <span className="app-settings-badge">Always on</span>
    </section>
    {device === null ? <p role="status">Checking device…</p> : device === 'desktop'
      ? <BrowserNotificationSettings active userId={userId} />
      : <PushPreferences active available={pushEnabled} ios={device.startsWith('ios')} standalone={device === 'ios-app'} />}
  </div>;
}
