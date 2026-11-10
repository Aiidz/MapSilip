'use client';

import { useEffect } from 'react';
import { listenForInstallPrompt } from '../lib/pwa/install-prompt';

/** Save installation capability early; show UI and request permissions only after login. */
export function InstallPromptCapture() {
  useEffect(() => listenForInstallPrompt(window), []);
  return null;
}
