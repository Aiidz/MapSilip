'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { canInviteInstall, dismissInstall, readDismissal } from '../lib/pwa/install';
import { getInstallPrompt, takeInstallPrompt, type InstallPromptEvent } from '../lib/pwa/install-prompt';
import { readDecision, saveDecision, setupStage } from '../lib/pwa/onboarding';
import { isMobileNotificationDevice } from '../lib/pwa/foreground';

const subscribeToDevice = () => () => {};
const deviceSnapshot = () => isMobileNotificationDevice(navigator);
const serverDeviceSnapshot = () => null;

const ForegroundFeed = dynamic(() => import('./ForegroundNotifications').then(module => module.ForegroundNotifications));
const Onboarding = dynamic(() => import('./PwaOnboarding').then(module => module.PwaOnboarding));

/** Mounted once in the authenticated shell; installation never depends on push. */
export function PwaManager({ userId, tenant, pushEnabled = false }: { userId: string; tenant: boolean; pushEnabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const mobile = useSyncExternalStore<boolean | null>(subscribeToDevice, deviceSnapshot, serverDeviceSnapshot);
  const [mode, setMode] = useState<'contact' | 'profile' | 'invite' | 'settings' | 'notifications'>('settings');
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
  const advanceSetup = useRef<() => void>(() => {});
  const [installing, setInstalling] = useState(false);
  const installPending = useRef(false);
  const currentStage = useRef<'contact' | 'profile' | 'invite' | 'settings' | 'notifications'>('settings');

  const openSettings = useCallback(() => {
    manualOpen.current = true; currentStage.current = 'settings'; setMode('settings'); setHasOpened(true); setOpen(true);
  }, []);

  useEffect(() => {
    let active = true;
    let unregisterUpdate: (() => void) | undefined;
    dismissed.current = false;
    let photoChecked = Boolean(readDecision(`profile:${userId}`));
    let photoUnavailable = false;
    let contactChecked = !tenant || Boolean(readDecision(`contact:${userId}`));
    let contactNeeded = false;
    let installationConfirmed = false;
    const photoRequest = new AbortController();
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
      const installed = installationConfirmed || display.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
      setStandalone(installed);
      setIos(isIos);
      let until = 0;
      try { until = readDismissal(window.localStorage, userId, Date.now()); } catch { /* Storage unavailable: session fallback. */ }
      const eligible = canInviteInstall({ authenticated: true, width: compact.matches ? window.innerWidth : 768,
        mobile: /iPhone|iPod|Android.*Mobile/i.test(ua), coarse: coarse.matches, tablet,
        standalone: installed, dismissedUntil: until, now: Date.now() });
      notificationScope.current = `notifications:${userId}:${installed ? 'app' : 'browser'}`;
      installEligible.current = (eligible && isIos) || (!installed && until <= Date.now() && Boolean(deferred.current))
        || (!installed && currentStage.current === 'invite' && !readDecision(`install:${userId}`));
      if (manualOpen.current || dismissed.current || !photoChecked || !contactChecked) return;
      const stage = setupStage({ contactNeeded: tenant && contactNeeded && !readDecision(`contact:${userId}`), photoDone: photoUnavailable || Boolean(readDecision(`profile:${userId}`)), notificationDone: Boolean(readDecision(notificationScope.current)),
        installDone: Boolean(readDecision(`install:${userId}`)),
        standalone: installed, installEligible: installEligible.current });
      if (!stage) { dismissed.current = true; setOpen(false); }
      else { currentStage.current = stage; setMode(stage); setHasOpened(true); setOpen(true); }
    }
    advanceSetup.current = updateEligibility;
    if (!contactChecked) {
      void fetch('/api/profile', { credentials: 'same-origin', cache: 'no-store', signal: photoRequest.signal })
        .then(async response => {
          if (!response.ok) return;
          const profile = await response.json();
          if (!active) return;
          contactNeeded = typeof profile.emergency_contact !== 'string' || !profile.emergency_contact.trim();
          if (!contactNeeded) saveDecision(`contact:${userId}`, 'done');
        })
        .catch(() => { /* A profile load failure must not be treated as a missing contact. */ })
        .finally(() => { if (active) { contactChecked = true; updateEligibility(); } });
    }
    if (!photoChecked) {
      void fetch('/api/profile/photo', { credentials: 'same-origin', cache: 'no-store', signal: photoRequest.signal })
        .then(async response => {
          if (!active) return;
          if (response.ok && response.headers.get('content-type')?.startsWith('image/')) saveDecision(`profile:${userId}`, 'done');
          else if (response.status !== 404) photoUnavailable = true;
          await response.body?.cancel();
        })
        .catch(() => { photoUnavailable = true; })
        .finally(() => { if (active) { photoChecked = true; updateEligibility(); } });
    }
    function beforeInstall(event: Event) {
      event.preventDefault();
      deferred.current = event as InstallPromptEvent;
      setNativeInstall(true);
      setInstallMessage('');
      updateEligibility();
    }
    function installed() {
      installationConfirmed = true;
      deferred.current = null; setNativeInstall(false); setStandalone(true);
      saveDecision(`install:${userId}`, 'done');
      setInstallMessage('');
      if (!manualOpen.current && currentStage.current === 'invite') updateEligibility();
    }
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
      active = false; photoRequest.abort(); advanceSetup.current = () => {}; unregisterUpdate?.();
      window.removeEventListener('mapsilip-open-app-settings', openSettings);
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', installed);
      document.removeEventListener('visibilitychange', visible);
      compact.removeEventListener('change', updateEligibility);
      display.removeEventListener('change', updateEligibility);
    };
  }, [userId, tenant, openSettings]);

  function close() {
    dismissed.current = true;
    // Closing setup defers the remaining steps; per-step Not now only defers that step.
    if (mode !== 'settings') {
      if (tenant && !readDecision(`contact:${userId}`)) saveDecision(`contact:${userId}`, 'later');
      if (!readDecision(`profile:${userId}`)) saveDecision(`profile:${userId}`, 'later');
      if (!readDecision(`install:${userId}`)) saveDecision(`install:${userId}`, 'later');
      if (!readDecision(notificationScope.current)) saveDecision(notificationScope.current, 'later');
    }
    manualOpen.current = false;
    setOpen(false);
  }
  function continueSetup(decision: 'enabled' | 'later') {
    const stage = currentStage.current;
    if (stage === 'settings') return;
    const scope = stage === 'contact' ? `contact:${userId}` : stage === 'profile' ? `profile:${userId}` : stage === 'invite' ? `install:${userId}` : notificationScope.current;
    saveDecision(scope, decision);
    if (stage === 'invite' && decision === 'later') {
      try { dismissInstall(window.localStorage, userId, Date.now()); } catch { /* Session decision remains available. */ }
    }
    advanceSetup.current();
  }
  async function install() {
    if (installPending.current) return;
    const event = takeInstallPrompt() ?? deferred.current;
    if (!event) {
      setInstallMessage(ios
        ? 'In Safari, tap Share, then Add to Home Screen.'
        : 'Choose Install app or Add to Home screen from your browser menu.');
      return;
    }
    deferred.current = null; setNativeInstall(false);
    setInstallMessage('');
    installPending.current = true; setInstalling(true);
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === 'dismissed') setInstallMessage(ios
        ? 'In Safari, tap Share, then Add to Home Screen.'
        : 'Choose Install app or Add to Home screen from your browser menu.');
      if (choice.outcome === 'accepted' && !manualOpen.current) {
        saveDecision(`install:${userId}`, 'done');
        advanceSetup.current();
      }
    } catch { setInstallMessage('The install prompt could not open. Use your browser’s install menu or try again later.'); }
    finally { installPending.current = false; setInstalling(false); }
  }
  function update() {
    if (!waiting) return;
    // Explicit action only: never reload during an automatic update.
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    waiting.postMessage({ type: 'MAPSILIP_ACTIVATE_UPDATE' });
  }
  return <>
    {mobile !== null && <ForegroundFeed userId={userId} mobile={mobile} />}
    {hasOpened && <Onboarding key={userId} installing={installing} userId={userId} mobile={mobile} mode={mode} open={open} onClose={close} onInstall={() => { void install(); }} ios={ios} onContinue={continueSetup} installMessage={installMessage}
      nativeInstall={nativeInstall} standalone={standalone} updateAvailable={Boolean(waiting)} onUpdate={update} pushEnabled={pushEnabled} />}
  </>;
}
