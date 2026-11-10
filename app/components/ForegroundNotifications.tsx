'use client';

import { useEffect } from 'react';
import { createNoticeGuard, foregroundNotificationReceivedEvent, foregroundSettingsEvent, readForegroundEnabled } from '../lib/pwa/foreground';

/** One authenticated live feed per shell; no polling and no notification history replay. */
export function ForegroundNotifications({ userId, mobile }: { userId: string; mobile: boolean }) {
  useEffect(() => {
    let alive = true;
    let connection = 0;
    let stream: EventSource | undefined;
    const alerts = new Set<Notification>();
    const accept = createNoticeGuard(userId);
    function closeAlerts() { for (const alert of alerts) alert.close(); alerts.clear(); }
    function optedIn() { try { return readForegroundEnabled(window.localStorage, userId); } catch { return false; } }
    async function showDesktopAlert(id: string) {
      if (!alive || mobile || typeof Notification === 'undefined' || Notification.permission !== 'granted' || !optedIn()) return;
      const display = async () => {
        if (!alive || Notification.permission !== 'granted' || !optedIn()) return;
        const key = `mapsilip.foreground.seen.v1:${userId}`;
        let seen: string[] = [];
        try { const saved: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]'); if (Array.isArray(saved)) seen = saved.filter((item): item is string => typeof item === 'string').slice(-100); } catch { /* The in-memory guard and notification tag still bound duplicates. */ }
        if (seen.includes(id)) return;
        const alert = new Notification('MapSilip', { body: 'You have a new update.', icon: '/icon-192.png', tag: `mapsilip:${id}` });
        try { window.localStorage.setItem(key, JSON.stringify([...seen, id].slice(-100))); } catch { /* Storage failure must not break in-app updates. */ }
        if (alerts.size >= 20) { const oldest = alerts.values().next().value!; oldest.close(); alerts.delete(oldest); }
        alerts.add(alert);
        alert.onclose = () => alerts.delete(alert);
        alert.onclick = () => { alert.close(); window.open(`/notifications/open?id=${encodeURIComponent(id)}`, '_blank', 'noopener'); };
      };
      try {
        // Serialize cross-tab deduplication where the browser supports Web Locks.
        if (navigator.locks) await navigator.locks.request(`mapsilip.foreground:${userId}`, display);
        else if (document.hasFocus()) await display();
      } catch { /* Permission/OS changes must never interrupt the account UI. */ }
    }
    function connect() {
      const generation = ++connection;
      stream?.close(); stream = undefined;
      if (!alive || (mobile && document.visibilityState !== 'visible') || typeof EventSource === 'undefined') return;
      // Same-origin EventSource sends HttpOnly cookies without exposing them to JavaScript.
      stream = new EventSource('/api/notifications/live');
      stream.addEventListener('message', event => {
        if (!alive || generation !== connection) return;
        let row: unknown;
        try { row = JSON.parse(event.data); } catch { return; }
        if (!accept(row)) return;
        window.dispatchEvent(new Event(foregroundNotificationReceivedEvent));
        window.dispatchEvent(new Event('mapsilip-notifications-updated'));
        void showDesktopAlert(String((row as { id: string }).id));
      });
      stream.addEventListener('ready', () => {
        if (alive && generation === connection) window.dispatchEvent(new Event('mapsilip-notifications-updated'));
      });
    }
    function settingsChanged() {
      if (!optedIn()) closeAlerts();
    }
    function visibilityChanged() { if (mobile) connect(); }
    connect();
    window.addEventListener(foregroundSettingsEvent, settingsChanged);
    window.addEventListener('storage', settingsChanged);
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      alive = false; connection++;
      stream?.close();
      closeAlerts();
      window.removeEventListener(foregroundSettingsEvent, settingsChanged);
      window.removeEventListener('storage', settingsChanged);
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, [userId, mobile]);
  return null;
}
