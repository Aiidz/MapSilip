'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { canInviteInstall, dismissInstall, readDismissal } from '../lib/pwa/install';

const Onboarding = dynamic(() => import('./PwaOnboarding').then(module => module.PwaOnboarding));
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

/** Mounted once in the authenticated shell; installation never depends on push. */
export function PwaManager({ userId, pushEnabled = false }: { userId: string; pushEnabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [ios, setIos] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [nativeInstall, setNativeInstall] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const deferred = useRef<InstallEvent | null>(null);
  const dismissed = useRef(false);

  useEffect(() => {
    let active = true;
    let unregisterUpdate: (() => void) | undefined;
    dismissed.current = false;
    const compact = window.matchMedia('(max-width: 767px)');
    const display = window.matchMedia('(display-mode: standalone)');
    const coarse = window.matchMedia('(pointer: coarse)');
    const ua = navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const tablet = /iPad|Tablet/i.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    function updateEligibility() {
      if (!active) return;
      const installed = display.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
      setStandalone(installed);
      setIos(isIos);
      let until = 0;
      try { until = readDismissal(window.localStorage, userId, Date.now()); } catch { /* Storage unavailable: session fallback. */ }
      const eligible = canInviteInstall({ authenticated: true, width: compact.matches ? window.innerWidth : 768,
        mobile: /iPhone|iPod|Android.*Mobile/i.test(ua), coarse: coarse.matches, tablet,
        standalone: installed, dismissedUntil: until, now: Date.now() });
      if (!eligible) setOpen(false);
      else if (!dismissed.current) { setHasOpened(true); setOpen(true); }
    }
    function beforeInstall(event: Event) {
      event.preventDefault();
      deferred.current = event as InstallEvent;
      setNativeInstall(true);
      updateEligibility();
    }
    function installed() {
      deferred.current = null; setNativeInstall(false); setStandalone(true); setOpen(false);
    }
    function openSettings() { setHasOpened(true); setOpen(true); }
    window.addEventListener('mapsilip-open-app-settings', openSettings);
    function visible() { if (document.visibilityState === 'visible') updateEligibility(); }
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', installed);
    document.addEventListener('visibilitychange', visible);
    compact.addEventListener('change', updateEligibility);
    display.addEventListener('change', updateEligibility);
    updateEligibility();
    if ('serviceWorker' in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(registration => {
        if (!active) return;
        if (registration.waiting) setWaiting(registration.waiting);
        const update = () => {
          const worker = registration.installing;
          if (!worker) return;
          const changed = () => {
            if (active && worker.state === 'installed' && navigator.serviceWorker.controller) setWaiting(registration.waiting);
          };
          worker.addEventListener('statechange', changed);
        };
        registration.addEventListener('updatefound', update);
        unregisterUpdate = () => registration.removeEventListener('updatefound', update);
      }).catch(() => { /* Installation instructions remain available without SW support. */ });
    }
    return () => {
      active = false; unregisterUpdate?.();
      window.removeEventListener('mapsilip-open-app-settings', openSettings);
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', installed);
      document.removeEventListener('visibilitychange', visible);
      compact.removeEventListener('change', updateEligibility);
      display.removeEventListener('change', updateEligibility);
    };
  }, [userId]);

  function close() {
    dismissed.current = true;
    try { dismissInstall(window.localStorage, userId, Date.now()); } catch { /* In-memory dismissal still works. */ }
    setOpen(false);
  }
  async function install() {
    const event = deferred.current;
    if (!event) return;
    deferred.current = null; setNativeInstall(false);
    try { await event.prompt(); await event.userChoice; } finally { close(); }
  }
  function update() {
    if (!waiting) return;
    // Explicit action only: never reload during an automatic update.
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    waiting.postMessage({ type: 'MAPSILIP_ACTIVATE_UPDATE' });
  }
  return <>
    <button className="pwa-settings-link" type="button" onClick={() => { setHasOpened(true); setOpen(true); }}>App and notifications{waiting ? ' · Update available' : ''}</button>
    {hasOpened && <Onboarding open={open} onClose={close} onInstall={() => { void install(); }} ios={ios}
      nativeInstall={nativeInstall} standalone={standalone} updateAvailable={Boolean(waiting)} onUpdate={update} pushEnabled={pushEnabled} />}
  </>;
}
