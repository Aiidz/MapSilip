'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function ActivationForm() {
  const router = useRouter();
  const [details, setDetails] = useState<{ email: string; displayName: string } | null>(null);
  const [message, setMessage] = useState('Checking invitation…');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'create' | 'activate'>('create');
  const [params, setParams] = useState<{ id: string; token: string } | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get('id') ?? '';
    const token = url.searchParams.get('token') ?? '';
    if (!id || !token) { Promise.resolve().then(() => setMessage('This invitation is incomplete.')); return; }
    fetch(`/api/account-requests/invitation?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`)
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(async value => {
        setParams({ id, token }); setDetails(value);
        try {
          const response = await fetch('/api/account-requests/activate', { method: 'POST',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, token }) });
          if (response.ok) { router.replace('/tenant'); return; }
        } catch { /* password activation remains available */ }
        setMessage('');
      })
      .catch(() => setMessage('This invitation is unavailable or has expired.'));
  }, [router]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!params || busy) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    if (mode === 'create' && password !== form.get('confirm')) { setMessage('Passwords do not match.'); return; }
    setBusy(true); setMessage('');
    try {
      const response = await fetch(mode === 'create' ? '/api/account-requests/invitation' : '/api/account-requests/activate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, password }),
      });
      const value = await response.json();
      if (response.ok && mode === 'activate') { router.replace('/tenant'); return; }
      if (response.ok && mode === 'create') setMode('activate');
      setMessage(response.ok ? 'Check your email to confirm the account. Then enter your password here to activate it.' :
        mode === 'activate' ? 'Activation could not be completed. Check your password and email confirmation, then try again.' :
          value.message || 'Activation could not be started.');
    } catch { setMessage('Activation could not be completed. Try again.'); }
    finally { setBusy(false); }
  }
  return <>
    {details && <><p>Approved for {details.displayName} ({details.email}).</p>
      <form onSubmit={submit}>
        <div className="auth-field"><label htmlFor="activation-password">{mode === 'activate' ? 'Your account password' : 'Password'}</label><input id="activation-password" name="password" type="password" minLength={8} maxLength={128} autoComplete={mode === 'activate' ? 'current-password' : 'new-password'} required /></div>
        {mode === 'create' && <div className="auth-field"><label htmlFor="activation-confirm">Confirm password</label><input id="activation-confirm" name="confirm" type="password" minLength={8} maxLength={128} autoComplete="new-password" required /></div>}
        <button className="auth-submit" disabled={busy}>{busy ? 'Working…' : mode === 'activate' ? 'Activate account' : 'Create account'}</button>
      </form><button type="button" className="auth-switch" onClick={() => { setMode(mode === 'create' ? 'activate' : 'create'); setMessage(''); }} disabled={busy}>
        {mode === 'create' ? 'Already confirmed your email? Activate account' : 'Need to create your account first?'}
      </button></>}
    <p role="status">{message}</p>
  </>;
}
