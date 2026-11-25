'use client';

import { useEffect, useRef } from 'react';
import { Icon } from './Icon';

type TransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

export function ThemeToggle() {
  const sequence = useRef(0);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'mapsilip-theme' && (e.newValue === 'light' || e.newValue === 'dark')) {
        document.documentElement.dataset.theme = e.newValue;
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function toggleTheme() {
    const root = document.documentElement;
    const revision = ++sequence.current;
    const finish = () => {
      if (sequence.current !== revision) return;
      root.classList.remove('theme-color-transition');
      root.classList.remove('theme-snapshot-transition');
    };
    const update = () => {
      const current = root.dataset.theme
        ? root.dataset.theme === 'dark'
        : window.matchMedia('(prefers-color-scheme: dark)').matches;
      const next = !current;
      const nextTheme = next ? 'dark' : 'light';
      root.dataset.theme = nextTheme;
      try {
        localStorage.setItem('mapsilip-theme', nextTheme);
      } catch {}
    };
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const transitionDocument = document as TransitionDocument;

    if (reducedMotion) {
      root.classList.remove('theme-color-transition');
      root.classList.remove('theme-snapshot-transition');
      update();
      return;
    }
    if (transitionDocument.startViewTransition) {
      root.classList.remove('theme-color-transition');
      root.classList.add('theme-snapshot-transition');
      void transitionDocument.startViewTransition(update).finished.then(finish, finish);
      return;
    }

    root.classList.add('theme-color-transition');
    update();
    // Older browsers finish their color transitions without a cleanup timer.
    void Promise.allSettled((root.getAnimations?.({ subtree: true }) ?? []).map(animation => animation.finished)).then(finish);
  }

  return <button className="toolbar-icon" type="button" onClick={toggleTheme}
    aria-label="Toggle color theme"
    title="Switch color theme">
    <span className="toolbar-theme-icons"><Icon name="sun" className="toolbar-theme-icons__sun" /><Icon name="moon" className="toolbar-theme-icons__moon" /></span>
  </button>;
}
