'use client';

import { EmergencyContactFields } from './EmergencyContactFields';
import { emergencyContactLimit, formatEmergencyContact, parseEmergencyContact } from '../lib/emergency-contact';

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
  onContinue?: (decision: 'enabled' | 'later') => void; mode?: 'contact' | 'profile' | 'invite' | 'settings' | 'notifications'; mobile?: boolean | null; userId?: string; installMessage?: string; installing?: boolean;
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
    const contact = mode === 'contact';
    const title = contact ? 'Emergency contact' : profile ? 'Make Yourself at Home.' : notifications ? 'Stay in the Loop.' : 'Take MapSilip With You.';
    const busy = photoBusy || installing;
    return <ResponsiveOverlay open={open} dismissible={!busy} onClose={() => { if (!busy) onClose(); }} title={title} className="onboarding-overlay">
      <div className="welcome-screen setup-screen">
        <header className="onboarding-topbar"><span className="onboarding-wordmark">Map<span>Silip</span></span><button type="button" disabled={busy} onClick={onClose}>Skip setup</button></header>
        <div className="setup-composition" key={mode}>
          {!contact && <OnboardingArtwork scene={profile ? 4 : notifications ? 2 : 3} priority />}
          <div className="setup-copy">
            <h1 ref={heading} tabIndex={-1}>{title}</h1>
            <p className="setup-description">{contact ? 'Who should we call in an emergency?' : profile ? 'Add a photo so everyone can recognize you.' : notifications ? 'Receive important dormitory announcements, updates, and notifications.' : 'Install MapSilip for convenient access directly from your home screen.'}</p>
            <div className="setup-actions">
            {contact ? <EmergencyContact busy={photoBusy} onSaved={() => onContinue?.('enabled')} onBusy={setPhotoBusy} /> : profile ? <div className="setup-profile" aria-busy={photoBusy}>
              <div className="setup-profile__identity">
                {photoSaved && <ProfilePhoto className="setup-profile__photo" fallback={<Icon name="users" />} />}
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

function EmergencyContact({ busy, onSaved, onBusy }: { busy: boolean; onSaved: () => void; onBusy: (busy: boolean) => void }) {
  const [contact, setContact] = useState(() => parseEmergencyContact(''));
  const formattedContact = formatEmergencyContact(contact);
  const contactTooLong = Array.from(formattedContact).length > emergencyContactLimit;
  const validContact = !contactTooLong && Object.values(contact).every(value => value.trim());
  const [profile, setProfile] = useState<{ display_name: string; phone: string | null } | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/profile', { signal: controller.signal, cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!controller.signal.aborted) {
        setContact(parseEmergencyContact(data.emergency_contact ?? ''));
        setProfile({ display_name: data.display_name, phone: data.phone });
      }
    }).catch(() => { if (!controller.signal.aborted) setError('Could not load your profile.'); });
    return () => controller.abort();
  }, [attempt]);
  return <form className="setup-contact" onSubmit={async event => {
    event.preventDefault();
    if (busy || !profile || !validContact) return;
    onBusy(true);
    setError('');
    try {
      const response = await fetch('/api/operations', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'profile.update', data: { ...profile, emergency_contact: formattedContact } }) });
      if (!response.ok) throw new Error();
      window.dispatchEvent(new Event('mapsilip-profile-updated'));
      onSaved();
    } catch { setError('Could not save your emergency contact. Please try again.'); }
    finally { onBusy(false); }
  }}>
    <EmergencyContactFields contact={contact} onChange={setContact} disabled={busy || !profile} tooLong={contactTooLong} required />
    {error && <p role="alert">{error}</p>}
    {!profile && error ? <button type="button" className="button" onClick={() => { setError(''); setAttempt(attempt + 1); }}>Retry</button>
      : <button className="button button--primary" disabled={busy || !profile || !validContact}>Save and continue</button>}
  </form>;
}
