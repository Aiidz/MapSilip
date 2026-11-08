'use client';

import { useState, type FormEvent } from 'react';
import { Icon } from './Icon';

export function AccountRequestForm() {
  const [message, setMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const firstName = String(data.get('first_name') || '').trim();
    const lastName = String(data.get('last_name') || '').trim();
    const middleName = String(data.get('middle_name') || '').trim();
    const phone = String(data.get('phone') || '').trim();
    const email = String(data.get('email') || '').trim().toLowerCase();
    const password = String(data.get('password') || '');
    const confirmPassword = String(data.get('confirm_password') || '');

    if (password !== confirmPassword) {
      setMessage('Passwords do not match.');
      setIsSuccess(false);
      return;
    }
    if (password.length < 8) {
      setMessage('Password must be at least 8 characters.');
      setIsSuccess(false);
      return;
    }

    const name = [firstName, middleName, lastName].filter(Boolean).join(' ');
    setBusy(true);
    setMessage('');
    setIsSuccess(false);

    try {
      const response = await fetch('/api/account-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          first_name: firstName,
          last_name: lastName,
          middle_name: middleName,
          email,
          phone,
          password,
          confirm_password: confirmPassword,
        }),
      });
      const result = await response.json();
      if (response.ok) {
        setIsSuccess(true);
        setMessage(result.message || 'Account request submitted. Awaiting administrator approval and room assignment.');
        form.reset();
      } else {
        setIsSuccess(false);
        setMessage(result.message || 'Your request could not be sent. Please check your information and try again.');
      }
    } catch {
      setIsSuccess(false);
      setMessage('Your request could not be sent. Try again later.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h3 className="auth-section-title">Personal Information</h3>
      <div className="auth-row">
        <div className="auth-field">
          <label htmlFor="request-first">First Name</label>
          <input
            id="request-first"
            name="first_name"
            placeholder="First name"
            autoComplete="given-name"
            maxLength={40}
            required
          />
        </div>
        <div className="auth-field">
          <label htmlFor="request-last">Last Name</label>
          <input
            id="request-last"
            name="last_name"
            placeholder="Last name"
            autoComplete="family-name"
            maxLength={40}
            required
          />
        </div>
      </div>
      <div className="auth-field">
        <label htmlFor="request-middle">Middle Name (Optional)</label>
        <input
          id="request-middle"
          name="middle_name"
          placeholder="Middle name"
          maxLength={40}
        />
      </div>
      <div className="auth-field">
        <label htmlFor="request-phone">Contact Number</label>
        <input
          id="request-phone"
          name="phone"
          type="tel"
          placeholder="09XX XXX XXXX"
          autoComplete="tel"
          maxLength={30}
        />
      </div>

      <h3 className="auth-section-title">Account Information</h3>
      <div className="auth-field">
        <label htmlFor="request-email">Email Address</label>
        <input
          id="request-email"
          name="email"
          type="email"
          placeholder="admin@gmail.com"
          autoComplete="email"
          maxLength={320}
          required
        />
      </div>
      <div className="auth-field">
        <label htmlFor="request-password">Password</label>
        <span className="auth-field__input-wrap">
          <input
            id="request-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Enter password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
          />
          <button
            className="auth-password-toggle"
            type="button"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            onClick={() => setShowPassword(visible => !visible)}
          >
            <Icon name={showPassword ? 'eyeOff' : 'eye'} />
          </button>
        </span>
      </div>
      <div className="auth-field">
        <label htmlFor="request-confirm">Confirm Password</label>
        <span className="auth-field__input-wrap">
          <input
            id="request-confirm"
            name="confirm_password"
            type={showConfirm ? 'text' : 'password'}
            placeholder="Confirm password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
          />
          <button
            className="auth-password-toggle"
            type="button"
            aria-label={showConfirm ? 'Hide password' : 'Show password'}
            aria-pressed={showConfirm}
            onClick={() => setShowConfirm(visible => !visible)}
          >
            <Icon name={showConfirm ? 'eyeOff' : 'eye'} />
          </button>
        </span>
      </div>

      <button className="auth-submit" type="submit" disabled={busy} aria-busy={busy}>
        {busy ? 'Submitting Request…' : 'Request Account'}
      </button>

      {message && (
        <p
          className={isSuccess ? 'auth-form-message' : 'auth-form-message'}
          style={isSuccess ? { borderColor: 'rgba(34, 197, 94, 0.3)', color: '#166534', background: 'rgba(34, 197, 94, 0.1)' } : undefined}
          role="status"
        >
          {message}
        </p>
      )}
    </form>
  );
}
