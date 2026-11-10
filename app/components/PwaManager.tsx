'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { canInviteInstall, dismissInstall, readDismissal } from '../lib/pwa/install';
import { getInstallPrompt, takeInstallPrompt, type InstallPromptEvent } from '../lib/pwa/install-prompt';
import { readDecision, saveDecision, setupStage } from '../lib/pwa/onboarding';
import { foregroundNotificationReceivedEvent, isMobileNotificationDevice } from '../lib/pwa/foreground';

const subscribeToDevice = () => () => {};
const deviceSnapshot = () => isMobileNotificationDevice(navigator);
const serverDeviceSnapshot = () => null;

const ForegroundFeed = dynamic(() => import('./ForegroundNotifications').then(module => module.ForegroundNotifications));
const Onboarding = dynamic(() => import('./PwaOnboarding').then(module => module.PwaOnboarding));

/** Mounted once in the authenticated shell; installation never depends on push. */
export function PwaManager({ userId, pushEnabled = false }: { userId: string; pushEnabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const mobile = useSyncExternalStore<boolean | null>(subscribeToDevice, deviceSnapshot, serverDeviceSnapshot);
  const [mode, setMode] = useState<'invite' | 'settings' | 'notifications'>('settings');
  const manualOpen = useRef(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [ios, setIos] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [nativeInstall, setNativeInstall] = useState(false);
  const [installMessage, setInstallMessage] = useState('');
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const deferred = useRef<InstallPromptEvent | null>(null);
  const dismissed = useRef(false);
  const notificationScope = useRef('');
  const installEligible = useRef(false);
  const currentStage = useRef<'invite' | 'settings' | 'notifications'>('settings');

  const openSettings = useCallback(() => {
    manualOpen.current = true; currentStage.current = 'settings'; setMode('settings'); setHasOpened(true); setOpen(true);
  }, []);

  useEffect(() => {
    let active = true;
    let unregisterUpdate: (() => void) | undefined;
    dismissed.current = false;
    deferred.current = getInstallPrompt();
    setNativeInstall(Boolean(deferred.current));
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
      notificationScope.current = `notifications:${userId}:${installed ? 'app' : 'browser'}`;
      installEligible.current = eligible && (isIos || Boolean(deferred.current));
      if (manualOpen.current || dismissed.current) return;
      const stage = setupStage({ notificationDone: Boolean(readDecision(notificationScope.current)),
        installDone: Boolean(readDecision(`install:${userId}`)), mobile: isMobileNotificationDevice(navigator),
        standalone: installed, installEligible: installEligible.current });
      if (!stage) setOpen(false);
      else { currentStage.current = stage; setMode(stage); setHasOpened(true); setOpen(true); }
    }
    function beforeInstall(event: Event) {
      event.preventDefault();
      deferred.current = event as InstallPromptEvent;
      setNativeInstall(true);
      setInstallMessage('');
      updateEligibility();
    }
    function installed() {
      deferred.current = null; setNativeInstall(false); setStandalone(true);
      saveDecision(`install:${userId}`, 'done');
      setInstallMessage('');
      if (!manualOpen.current && currentStage.current === 'invite') { dismissed.current = true; setOpen(false); }
    }
    window.addEventListener('mapsilip-open-app-settings', openSettings);
    window.addEventListener(foregroundNotificationReceivedEvent, openSettings);
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
      window.removeEventListener(foregroundNotificationReceivedEvent, openSettings);
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', installed);
      document.removeEventListener('visibilitychange', visible);
      compact.removeEventListener('change', updateEligibility);
      display.removeEventListener('change', updateEligibility);
    };
  }, [userId, openSettings]);

  function close() {
    dismissed.current = true;
    if (mode === 'notifications') saveDecision(notificationScope.current, 'later');
    if (mode !== 'settings') saveDecision(`install:${userId}`, 'later');
    if (mode === 'invite') {
      try { dismissInstall(window.localStorage, userId, Date.now()); } catch { /* In-memory dismissal still works. */ }
    }
    manualOpen.current = false;
    setOpen(false);
  }
  function continueSetup(decision: 'enabled' | 'later') {
    saveDecision(notificationScope.current, decision);
    if (mobile && !standalone && installEligible.current && !readDecision(`install:${userId}`)) {
      currentStage.current = 'invite'; setMode('invite');
    } else { dismissed.current = true; setOpen(false); }
  }
  async function install() {
    const event = takeInstallPrompt() ?? deferred.current;
    if (!event) {
      setInstallMessage(ios
        ? 'In Safari, tap Share, then Add to Home Screen.'
        : 'Choose Install app or Add to Home screen from your browser menu.');
      return;
    }
    deferred.current = null; setNativeInstall(false);
    setInstallMessage('');
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === 'dismissed') setInstallMessage(ios
        ? 'In Safari, tap Share, then Add to Home Screen.'
        : 'Choose Install app or Add to Home screen from your browser menu.');
      if (mode === 'invite') { saveDecision(`install:${userId}`, choice.outcome === 'accepted' ? 'done' : 'later'); dismissed.current = true; setOpen(false); }
    } catch { setInstallMessage('The install prompt could not open. Use your browser’s install menu or try again later.'); }
  }
  function update() {
    if (!waiting) return;
    // Explicit action only: never reload during an automatic update.
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    waiting.postMessage({ type: 'MAPSILIP_ACTIVATE_UPDATE' });
  }
  return <>
    {mobile !== null && <ForegroundFeed userId={userId} mobile={mobile} />}
    {hasOpened && <Onboarding userId={userId} mobile={mobile} mode={mode} open={open} onClose={close} onInstall={() => { void install(); }} ios={ios} onContinue={continueSetup} installMessage={installMessage}
      nativeInstall={nativeInstall} standalone={standalone} updateAvailable={Boolean(waiting)} onUpdate={update} pushEnabled={pushEnabled} />}
  </>;
}
