'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';

const photoUpdated = 'mapsilip-profile-photo-updated';

export function ProfilePhoto({ className, fallback }: { className: string; fallback: ReactNode }) {
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const refresh = () => { setLoaded(false); setVersion(Date.now()); };
    window.addEventListener(photoUpdated, refresh);
    return () => window.removeEventListener(photoUpdated, refresh);
  }, []);
  return <span className={`${className} profile-photo${loaded ? ' profile-photo--loaded' : ''}`} aria-hidden="true">
    {!loaded && fallback}
    <Image src={`/api/profile/photo?v=${version}`} alt="" width={88} height={88} unoptimized
      className={loaded ? 'profile-photo__image is-loaded' : 'profile-photo__image'}
      onLoad={() => setLoaded(true)} onError={() => setLoaded(false)} />
  </span>;
}

export function ProfilePhotoUpload() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy) return;
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size < 1 || file.size > 2_097_152) {
      setMessage('Choose a JPEG or PNG image under 2 MB.');
      return;
    }
    setBusy(true); setMessage('');
    try {
      const body = new FormData();
      body.set('purpose', 'profile');
      body.set('file', file);
      const response = await fetch('/api/attachments', { method: 'POST', body, credentials: 'same-origin' });
      if (!response.ok) throw new Error();
      const preview = await fetch(`/api/profile/photo?v=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
      if (!preview.ok || !preview.headers.get('content-type')?.startsWith('image/')) {
        setMessage('Photo uploaded, but it could not be displayed. Please reload and try again.');
        return;
      }
      window.dispatchEvent(new Event(photoUpdated));
      setMessage('Photo updated.');
    } catch { setMessage('Photo could not be updated. Please try again.'); }
    finally { setBusy(false); }
  }

  return <div className="profile-photo-control">
    <input ref={input} className="sr-only" type="file" accept="image/jpeg,image/png" aria-label="Choose profile photo" onChange={upload} tabIndex={-1} />
    <button className="button button--secondary" type="button" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Uploading…' : 'Change Photo'}</button>
    {message && <p role="status">{message}</p>}
  </div>;
}
