'use client';

import { PushPreferences } from './PushPreferences';
import { ResponsiveOverlay } from './ResponsiveOverlay';

export function PwaOnboarding({ open, onClose, onInstall, ios, nativeInstall, standalone, updateAvailable, onUpdate, pushEnabled }: {
  pushEnabled: boolean; open: boolean; onClose: () => void; onInstall: () => void; ios: boolean;
  nativeInstall: boolean; standalone: boolean; updateAvailable: boolean; onUpdate: () => void;
}) {
  return <ResponsiveOverlay open={open} onClose={onClose} title="Install MapSilip"
    description="Get convenient access to your dormitory portal.">
    <div className="pwa-settings">
      {standalone ? <p>MapSilip is already open as an installed app.</p> : nativeInstall ?
        <p>Add MapSilip to your home screen for convenient access.</p> : ios ? <>
          <p>On iPhone, open your browser’s Share or menu button, choose <strong>Add to Home Screen</strong>, then confirm Add. If available, keep <strong>Open as Web App</strong> enabled.</p>
          <p>If this option is missing, open this page in Safari. You may need to sign in again inside the installed app.</p>
        </> : <p>Open your browser menu and look for Install app or Add to Home screen. Embedded browsers may require opening this page in Chrome or Safari first.</p>}
      <p className="muted">You can keep using MapSilip here. Installation and notifications depend on your browser and device. Installing does not enable notifications or location access.</p>
      {updateAvailable && <div><p>An app update is available. Save any unfinished work before updating.</p><button type="button" className="button button--secondary" onClick={onUpdate}>Update and reload</button></div>}
      <PushPreferences active={open} available={pushEnabled} ios={ios} standalone={standalone} />
      <div className="form-actions">
        <button type="button" className="button button--secondary" onClick={onClose}>Not now</button>
        {!standalone && nativeInstall && <button type="button" className="button button--primary" onClick={onInstall}>Install MapSilip</button>}
      </div>
    </div>
  </ResponsiveOverlay>;
}
