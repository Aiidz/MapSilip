"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

function Message({ children, sent = false }: { children: string; sent?: boolean }) {
  return <p className="auth-form-message" role={sent ? "status" : "alert"}>{children}</p>;
}

export function TenantRecoveryForm({ onSentChange }: { onSentChange?: (sent: boolean) => void }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [retryIn, setRetryIn] = useState(0);
  const [sent, setSent] = useState(false);
  const confirmation = useRef<HTMLDivElement>(null);
  useEffect(() => { if (sent) confirmation.current?.focus(); }, [sent]);
  useEffect(() => {
    if (retryIn <= 0) return;
    const timer = window.setTimeout(() => setRetryIn(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [retryIn]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || retryIn > 0) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/recover", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
      });
      if (response.status === 429) {
        setRetryIn(60);
        setMessage('Please wait before requesting another email. You can still use the last reset link sent to you.');
        return;
      }
      if (response.status === 400) {
        const result = await response.json();
        if (result.error === 'account_not_found') {
          setSent(false);
          onSentChange?.(false);
          setMessage('No account is registered with this email. Please enter your account email and try again.');
          return;
        }
      }
      if (!response.ok) throw new Error();
      setRetryIn(60);
      setSent(true);
      onSentChange?.(true);
    } catch {
      setMessage("Password reset is temporarily unavailable. Try again later.");
    } finally { setBusy(false); }
  }

  return <form onSubmit={submit}>
    {sent ? <div className="auth-recovery-confirmation" ref={confirmation} tabIndex={-1} role="status">
      <span className="auth-recovery-confirmation__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg></span>
      <p>A password reset link has been requested for <strong>{email}</strong>.</p>
      <p>Check your inbox and spam folder. Open the link in this browser to choose your new password.</p>
    </div> : <label className="auth-field" htmlFor="recovery-email">Email Address
      <input id="recovery-email" name="email" type="email" autoComplete="email" autoCapitalize="none"
        autoCorrect="off" value={email} onChange={event => { setEmail(event.target.value); setMessage(''); }} required maxLength={320} aria-invalid={message.startsWith('No account')} aria-describedby={message ? 'recovery-message' : undefined} />
    </label>}
    {message && <p id="recovery-message" className="auth-form-message" role="alert">{message}</p>}
    <button className="auth-submit" type="submit" disabled={busy || retryIn > 0} aria-busy={busy}>
      {busy ? "Sending…" : retryIn > 0 ? `Send again in ${retryIn}s` : sent ? "Resend Reset Link" : "Send Reset Link"}
    </button>
    {sent && <button className="auth-recovery-change-email" type="button" disabled={busy} onClick={() => { setSent(false); setMessage(''); onSentChange?.(false); }}>Use a different email</button>}
    <p className="auth-switch"><Link href="/login">Return to Log In</Link></p>
  </form>;
}

export function TenantResetForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (password.length < 8 || password !== confirmation) {
      setMessage(password.length < 8 ? "Use at least 8 characters." : "The passwords do not match.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }),
      });
      if (!response.ok) throw new Error();
      router.replace("/login");
    } catch {
      setMessage("The password could not be updated. Request a new reset link and try again.");
      setBusy(false);
    }
  }

  return <form onSubmit={submit}>
    <label className="auth-field" htmlFor="reset-password">New Password
      <input id="reset-password" name="password" type="password" autoComplete="new-password" value={password}
        onChange={event => setPassword(event.target.value)} required minLength={8} maxLength={1024} />
    </label>
    <label className="auth-field" htmlFor="reset-password-confirm">Confirm New Password
      <input id="reset-password-confirm" name="password-confirm" type="password" autoComplete="new-password" value={confirmation}
        onChange={event => setConfirmation(event.target.value)} required minLength={8} maxLength={1024} />
    </label>
    {message && <Message>{message}</Message>}
    <button className="auth-submit" type="submit" disabled={busy} aria-busy={busy}>
      {busy ? "Updating…" : "Update Password"}
    </button>
  </form>;
}
