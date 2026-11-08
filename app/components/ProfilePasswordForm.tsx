'use client';

import { useState, type FormEvent } from 'react';

export function ProfilePasswordForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const currentPassword = String(fields.get('currentPassword') || '');
    const newPassword = String(fields.get('newPassword') || '');
    setFailed(true);
    if (newPassword !== fields.get('confirmation')) { setMessage('The new passwords do not match.'); return; }
    if (currentPassword === newPassword) { setMessage('Choose a password different from your current password.'); return; }
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/auth/change-password', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword }) });
      if (!response.ok) throw new Error();
      form.reset(); setFailed(false); setMessage('Your password has been updated.');
    } catch { setMessage('Password could not be updated. Check your current password and try again.'); }
    finally { setBusy(false); }
  }
  return <form className="tenant-profile-form profile-password-form" onSubmit={submit}>
    <label>Current Password<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={1024} disabled={busy} /></label>
    <label>New Password<input name="newPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={1024} aria-describedby="profile-password-help" disabled={busy} /></label>
    <label>Confirm Password<input name="confirmation" type="password" autoComplete="new-password" required minLength={8} maxLength={1024} disabled={busy} /></label>
    <small id="profile-password-help">Use at least 8 characters.</small>
    {message && <p role={failed ? 'alert' : 'status'}>{message}</p>}
    <button className="button button--secondary" disabled={busy} aria-busy={busy}>{busy ? 'Updating…' : 'Update Password'}</button>
  </form>;
}
