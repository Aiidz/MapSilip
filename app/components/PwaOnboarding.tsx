'use client';

import { useEffect, useRef, useState } from 'react';
import { ProfilePhoto, ProfilePhotoUpload } from './ProfilePhoto';
import { BrowserNotificationSettings } from './BrowserNotificationSettings';
import { OnboardingArtwork } from './OnboardingArtwork';
import { Icon } from './Icon';
import { PushPreferences } from './PushPreferences';
import { ResponsiveOverlay } from './ResponsiveOverlay';

export function PwaOnboarding({ open, onClose, onInstall, ios, nativeInstall, standalone, updateAvailable, onUpdate, pushEnabled, mode = 'settings', mobile = null, userId = '', installMessage = '', installing = false, onContinue }: {
  pushEnabled: boolean; open: boolean; onClose: () => void; onInstall: () => void; ios: boolean;
  nativeInstall: boolean; standalone: boolean; updateAvailable: boolean; onUpdate: () => void;
  onContinue?: (decision: 'enabled' | 'later') => void; mode?: 'profile' | 'invite' | 'settings' | 'notifications'; mobile?: boolean | null; userId?: string; installMessage?: string; installing?: boolean;
}) {
  const [photoSaved, setPhotoSaved] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousMode = useRef(mode);
  useEffect(() => {
    if (open && previousMode.current !== mode) heading.current?.focus({ preventScroll: true });
    previousMode.current = mode;
  }, [mode, open]);
  if (mode !== 'settings') {
    const notifications = mode === 'notifications';
    const profile = mode === 'profile';
    const title = profile ? 'Make Yourself at Home.' : notifications ? 'Stay in the Loop.' : 'Take MapSilip With You.';
    const busy = photoBusy || installing;
    return <ResponsiveOverlay open={open} dismissible={!busy} onClose={() => { if (!busy) onClose(); }} title={title} className="onboarding-overlay">
      <div className="welcome-screen setup-screen">
        <header className="onboarding-topbar"><span className="onboarding-wordmark">Map<span>Silip</span></span><button type="button" disabled={busy} onClick={onClose}>Skip setup</button></header>
        <div className="setup-composition" key={mode}>
          <OnboardingArtwork scene={profile ? 4 : notifications ? 2 : 3} priority />
          <div className="setup-copy">
            <ol className="setup-progress" aria-label="Account setup">
              {(['profile', 'invite', 'notifications'] as const).map((step, index) => <li key={step} aria-current={step === mode ? 'step' : undefined}><span aria-hidden="true">{index + 1}</span>{['Photo', 'Install', 'Notifications'][index]}</li>)}
            </ol>
            <h1 ref={heading} tabIndex={-1}>{title}</h1>
            <p className="setup-description">{profile ? 'Add a photo so everyone can recognize you.' : notifications ? 'Receive important dormitory announcements, updates, and notifications.' : 'Install MapSilip for convenient access directly from your home screen.'}</p>
            {profile ? <div className="setup-profile" aria-busy={photoBusy}>
              <div className="setup-profile__identity">
                <ProfilePhoto className="setup-profile__photo" fallback={<Icon name="users" />} />
                <ProfilePhotoUpload label={photoSaved ? 'Change photo' : 'Choose photo'} onUploaded={() => setPhotoSaved(true)} onBusyChange={setPhotoBusy} />
              </div>
              {photoSaved && <button type="button" className="button button--primary" disabled={photoBusy} onClick={() => onContinue?.('enabled')}>Continue<Icon name="chevron" /></button>}
            </div> : notifications ? <div className="setup-notifications">
              {mobile === null ? <p role="status">Checking device…</p> : mobile
                ? <PushPreferences active={open} available={pushEnabled} ios={ios} standalone={standalone} onContinue={() => onContinue?.('enabled')} />
                : <BrowserNotificationSettings active={open} userId={userId} onContinue={() => onContinue?.('enabled')} />}
              <p className="setup-reassurance">In-app notifications are always available.</p>
            </div> : <>
              {ios && !standalone && <ol className="install-instructions"><li><span>1</span><div>Tap <strong>Share</strong> in Safari.</div></li><li><span>2</span><div>Select <strong>Add to Home Screen</strong>.</div></li><li><span>3</span><div>Tap <strong>Add</strong>, then open MapSilip.</div></li></ol>}
              {standalone ? <><p role="status">MapSilip is installed on this device.</p><button type="button" className="button button--primary" onClick={() => onContinue?.('enabled')}>Continue<Icon name="chevron" /></button></>
                : nativeInstall || installing ? <button type="button" className="button button--primary" disabled={installing} onClick={onInstall}>{installing ? 'Installing…' : 'Install MapSilip'}<Icon name="download" /></button>
                : !ios && <p className="setup-reassurance">Choose Install app or Add to Home Screen in your browser menu.</p>}
              {installMessage && <p className="setup-reassurance" role="status">{installMessage}</p>}
            </>}
            {!(profile && photoSaved) && <button type="button" disabled={busy} className="setup-later" onClick={() => onContinue?.('later')}>Not now<Icon name="chevron" /></button>}
          </div>
        </div>
      </div>
    </ResponsiveOverlay>;
  }
  const installation = <section className="app-settings-group" aria-label="Install MapSilip">
    <div className="app-settings-row">
      <span className="app-settings-icon"><Icon name="download" /></span>
      <div className="app-settings-copy"><h3>Install MapSilip</h3><p>{standalone ? 'Ready on this device.' : 'Quick access from your home screen.'}</p></div>
      {standalone && <span className="app-settings-badge">Installed</span>}
    </div>
    {!standalone && <div className="app-settings-content">
      <button type="button" className="button button--primary" onClick={onInstall}>Install MapSilip</button>
      {!nativeInstall && <p className="app-settings-help" role={installMessage ? 'status' : undefined}>{installMessage || (ios
        ? <>In Safari: Share → <strong>Add to Home Screen</strong>.</>
        : <>If no prompt opens, choose <strong>Install app</strong> in your browser menu.</>)}</p>}
    </div>}
  </section>;
  return <ResponsiveOverlay open={open} onClose={onClose} title="Notification settings" className="app-settings-overlay">
    <div className="app-settings">
      <>
        <section className="app-settings-group" aria-label="In-app notifications">
          <div className="app-settings-row">
            <span className="app-settings-icon"><Icon name="bell" /></span>
            <div className="app-settings-copy"><h3>In-app notifications</h3><p>Updates inside MapSilip.</p></div>
            <span className="app-settings-badge">Always on</span>
          </div>
        </section>
        {mobile === null ? <p role="status">Checking device…</p> : mobile ? <PushPreferences active={open} available={pushEnabled} ios={ios} standalone={standalone} /> : <BrowserNotificationSettings active={open} userId={userId} />}
        {installation}
        {updateAvailable && <section className="app-settings-group app-settings-update"><div><h3>Update available</h3><p>Save your work first.</p></div><button type="button" className="button button--secondary" onClick={onUpdate}>Update app</button></section>}
      </>
      <div className="app-settings-footer"><button type="button" className="button button--secondary" onClick={onClose}>Done</button></div>
    </div>
  </ResponsiveOverlay>;
}
