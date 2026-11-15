'use client';

import { uploadAttachment } from '../lib/uploads/client';
import Image from 'next/image';
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';

const photoUpdated = 'mapsilip-profile-photo-updated';

export function ProfilePhoto({ className, fallback, userId }: { className: string; fallback: ReactNode; userId?: string }) {
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const refresh = () => { setLoaded(false); setVersion(Date.now()); };
    window.addEventListener(photoUpdated, refresh);
    return () => window.removeEventListener(photoUpdated, refresh);
  }, []);
  return <span className={`${className} profile-photo${loaded ? ' profile-photo--loaded' : ''}`} aria-hidden="true">
    {!loaded && fallback}
    <Image key={userId} src={`/api/profile/photo?v=${version}${userId ? `&userId=${encodeURIComponent(userId)}` : ''}`} alt="" width={88} height={88} unoptimized
      className={loaded ? 'profile-photo__image is-loaded' : 'profile-photo__image'}
      onLoad={() => setLoaded(true)} onError={() => setLoaded(false)} />
  </span>;
}

export function ProfilePhotoUpload({ label = 'Change Photo', onUploaded, onBusyChange }: { label?: string; onUploaded?: () => void; onBusyChange?: (busy: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy) return;
    setBusy(true); onBusyChange?.(true); setMessage('');
    try {
      await uploadAttachment(file, 'profile');
      const preview = await fetch(`/api/profile/photo?v=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
      if (!preview.ok || !preview.headers.get('content-type')?.startsWith('image/')) {
        setMessage('Photo uploaded, but it could not be displayed. Please reload and try again.');
        return;
      }
      window.dispatchEvent(new Event(photoUpdated));
      setMessage('Photo updated.');
      onUploaded?.();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Photo could not be updated. Please try again.'); }
    finally { setBusy(false); onBusyChange?.(false); }
  }

  return <div className="profile-photo-control">
    <input ref={input} className="sr-only" type="file" accept="image/jpeg,image/png" aria-label="Choose profile photo" onChange={upload} tabIndex={-1} />
    <button className="button button--secondary" type="button" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Uploading…' : label}</button>
    {message && <p role="status">{message}</p>}
  </div>;
}
