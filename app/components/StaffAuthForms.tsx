"use client";

import { noticeContinuation } from '../lib/pwa/notification-navigation';

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "./Icon";

type AuthResponse = Readonly<{ state?: unknown; destination?: unknown; error?: unknown; message?: unknown }>;

function messageFor(body?: AuthResponse | null) {
  if (!body) return "Sign-in is temporarily unavailable. Try again later.";
  const code = body.error;
  if (code === "invalid_input") return "Check the information and try again.";
  if (code === "unauthenticated") return "The email or password could not be verified.";
  if (code === "rate_limited") return "Too many recent attempts. Wait a little while, then try again.";
  if (code === "room_unassigned") return "Your account is awaiting room assignment before you can access MapSilip.";
  if (typeof body.message === "string" && body.message !== "Access denied.") {
    return body.message;
  }
  if (code === "forbidden") return "Sign-in could not be authorized. Confirm the account is active and try again.";
  return typeof body.message === "string" ? body.message : "Sign-in is temporarily unavailable. Try again later.";
}

function PasswordField({ id, label, value, onChange, autoComplete, minLength }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  return <label className="auth-field" htmlFor={id}>
    {label}
    <span className="auth-field__input-wrap">
      <input id={id} name={id} type={visible ? "text" : "password"} autoComplete={autoComplete}
        value={value} onChange={event => onChange(event.target.value)} required maxLength={1024} minLength={minLength} />
      <button className="auth-password-toggle" type="button" aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
        aria-pressed={visible} onClick={() => setVisible(current => !current)}>
        <Icon name={visible ? "eyeOff" : "eye"} />
      </button>
    </span>
  </label>;
}

function Status({ children }: { children: string }) {
  return <p className="auth-form-message" role="alert">{children}</p>;
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/signin", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await response.json().catch(() => null) as AuthResponse | null;
      if (!response.ok || !body) {
        setError(messageFor(body));
        setBusy(false);
        return;
      }
      if (body.state === "restricted" && body.destination === "/auth/change-password") {
        router.replace("/auth/change-password");
        return;
      }
      if (body.state === "admitted" && ["/management", "/caretaker"].includes(String(body.destination))) {
        router.replace(noticeContinuation(new URLSearchParams(window.location.search).get("notice")) ?? body.destination as string);
        return;
      }
      if (body.state === "signed-in" && body.destination === "/tenant") {
        router.replace(noticeContinuation(new URLSearchParams(window.location.search).get("notice")) ?? "/tenant");
        return;
      }
      setError("Your account could not be authorized for MapSilip.");
      setBusy(false);
    } catch {
      setError("Sign-in is temporarily unavailable. Try again later.");
      setBusy(false);
    }
  }

  return <form onSubmit={submit}>
    <label className="auth-field" htmlFor="login-email">Email Address
      <input id="login-email" name="email" type="email" autoComplete="username" autoCapitalize="none"
        autoCorrect="off" value={email} onChange={event => setEmail(event.target.value)} required maxLength={320} />
    </label>
    <PasswordField id="login-password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
    <Link className="auth-recovery-link" href="/forgot-password">Forgot password?</Link>
    {error && <Status>{error}</Status>}
    <button className="auth-submit" type="submit" disabled={busy} aria-busy={busy}>
      {busy ? "Signing in…" : "Log In"}
    </button>
  </form>;
}

export function FirstLoginForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Use at least 8 characters for your new password.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Choose a password different from your temporary password.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/first-login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = await response.json().catch(() => null) as AuthResponse | null;
      if (!response.ok || !body) {
        setError(messageFor(body));
        setBusy(false);
        return;
      }
      if (body.state === "completed" && ["/management", "/caretaker"].includes(String(body.destination))) {
        router.replace(noticeContinuation(new URLSearchParams(window.location.search).get("notice")) ?? body.destination as string);
        return;
      }
      setError("The password change could not be confirmed. Sign in again or contact the owner.");
      setBusy(false);
    } catch {
      setError("The password change could not be confirmed. Try again later.");
      setBusy(false);
    }
  }

  return <form onSubmit={submit}>
    <PasswordField id="temporary-password" label="Temporary password" value={currentPassword}
      onChange={setCurrentPassword} autoComplete="current-password" />
    <PasswordField id="new-password" label="New password" value={newPassword}
      onChange={setNewPassword} autoComplete="new-password" minLength={8} />
    <PasswordField id="confirm-new-password" label="Confirm new password" value={confirmPassword}
      onChange={setConfirmPassword} autoComplete="new-password" minLength={8} />
    {error && <Status>{error}</Status>}
    <button className="auth-submit" type="submit" disabled={busy} aria-busy={busy}>
      {busy ? "Updating password…" : "Change Password"}
    </button>
  </form>;
}
