'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { ResponsiveOverlay } from './ResponsiveOverlay';

const query = '(max-width: 767px)';
function subscribe(callback: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}
const snapshot = () => window.matchMedia(query).matches;
const serverSnapshot = () => false;

export function MobileDetailSurface({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const mobile = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  if (!mobile) return children;
  return <ResponsiveOverlay open={open} onClose={onClose} title={title} className="mobile-record-details">{open && children}</ResponsiveOverlay>;
}
