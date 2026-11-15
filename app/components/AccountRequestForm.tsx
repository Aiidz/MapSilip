'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApplicantRoomPicker } from './ApplicantRoomPicker';
import { Icon } from './Icon';

export function AccountRequestForm({ onStageChange }: { onStageChange?: (stage: 'details' | 'rooms' | 'sent') => void }) {
  const [step, setStep] = useState<'details' | 'rooms'>('details');
  const [gender, setGender] = useState('');
  const [preferredRoom, setPreferredRoom] = useState('');
  const [roomReload, setRoomReload] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (step === 'rooms') heading.current?.focus(); }, [step]);
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

    if (step === 'details') {
      setGender(String(data.get('gender') || '')); setStep('rooms'); onStageChange?.('rooms'); setMessage('');
      return;
    }
    if (!preferredRoom) { setMessage('Choose a preferred room.'); return; }
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
          preferred_room_id: preferredRoom,
          first_name: firstName,
          last_name: lastName,
          middle_name: middleName,
          email,
          phone,
          gender: String(data.get('gender') || ''),
          password,
          confirm_password: confirmPassword,
        }),
      });
      const result = await response.json();
      if (response.ok) {
        setIsSuccess(true); onStageChange?.('sent');
        setMessage(result.message || 'Account request submitted. Awaiting administrator approval and room assignment.');
        form.reset();
      } else {
        setIsSuccess(false);
        if (result.error === 'room_unavailable') { setPreferredRoom(''); setRoomReload(value => value + 1); }
        setMessage(result.message || 'Your request could not be sent. Please check your information and try again.');
      }
    } catch {
      setIsSuccess(false);
      setMessage('Your request could not be sent. Try again later.');
    } finally {
      setBusy(false);
    }
  }

  if (isSuccess) return <div className="applicant-request-sent" role="status"><Icon name="shield" /><p>Your preferred room is included. Management will confirm your assignment.</p></div>;
  return (
    <form onSubmit={submit} className="applicant-request-form">
      <nav className="applicant-request-steps" aria-label="Request progress"><span aria-current={step === 'details' ? 'step' : undefined}>1 · Your details</span><span aria-current={step === 'rooms' ? 'step' : undefined}>2 · Room preference</span></nav>
      <div hidden={step !== 'details'}>
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

      <fieldset className="auth-field request-gender"><legend>Gender</legend><div className="request-gender__options"><label><input type="radio" name="gender" value="male" required checked={gender === 'male'} onChange={() => setGender('male')} /><span>Male</span></label><label><input type="radio" name="gender" value="female" required checked={gender === 'female'} onChange={() => setGender('female')} /><span>Female</span></label></div></fieldset>
      <h3 className="auth-section-title">Account Information</h3>
      <div className="auth-field">
        <label htmlFor="request-email">Email Address</label>
        <input
          id="request-email"
          name="email"
          type="email"
          placeholder="you@example.com"
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

      </div>
      {step === 'rooms' && <><h3 ref={heading} tabIndex={-1} className="auth-section-title">Choose your preferred room</h3><p className="applicant-picker__hint">Subject to administrator approval.</p><ApplicantRoomPicker gender={gender} selected={preferredRoom} onSelect={setPreferredRoom} reload={roomReload} /></>}
      <div className="applicant-request-actions">{step === 'rooms' && <button className="applicant-request-back" type="button" disabled={busy} onClick={() => { setStep('details'); onStageChange?.('details'); setPreferredRoom(''); setMessage(''); }}>← Back</button>}
      <button className="auth-submit" type="submit" disabled={busy || (step === 'rooms' && !preferredRoom)} aria-busy={busy}>
        {busy ? 'Sending…' : step === 'details' ? 'Continue' : 'Send request'}
      </button>
      </div>

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
