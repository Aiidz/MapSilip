'use client';

import { PhoneInput } from './PhoneInput';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApplicantRoomPicker } from './ApplicantRoomPicker';
import { Icon } from './Icon';

export function AccountRequestForm({ onStageChange }: { onStageChange?: (stage: 'details' | 'rooms' | 'sent') => void }) {
  const [page, setPage] = useState<'personal' | 'account' | 'rooms'>('personal');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [preferredRoom, setPreferredRoom] = useState('');
  const [roomReload, setRoomReload] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (page === 'rooms') heading.current?.focus(); }, [page]);
  const [message, setMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  function handleNextToAccount() {
    if (!firstName.trim() || !lastName.trim()) {
      setMessage('Please enter your first and last name.');
      return;
    }
    if (!phone.trim()) {
      setMessage('Please enter your contact number.');
      return;
    }
    if (!gender) {
      setMessage('Please select your gender.');
      return;
    }
    setMessage('');
    setPage('account');
    onStageChange?.('details');
  }

  function handleBackToPersonal() {
    setMessage('');
    setPage('personal');
    onStageChange?.('details');
  }

  function handleNextToRooms() {
    if (!email.trim() || !email.includes('@')) {
      setMessage('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setMessage('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }
    setMessage('');
    setPage('rooms');
    onStageChange?.('rooms');
  }

  function handleBackToAccount() {
    setMessage('');
    setPreferredRoom('');
    setPage('account');
    onStageChange?.('details');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (page === 'personal') {
      handleNextToAccount();
      return;
    }
    if (page === 'account') {
      handleNextToRooms();
      return;
    }
    if (busy) return;
    if (!preferredRoom) { setMessage('Choose a preferred room.'); return; }

    const name = [firstName.trim(), middleName.trim(), lastName.trim()].filter(Boolean).join(' ');
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
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          middle_name: middleName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          gender,
          password,
          confirm_password: confirmPassword,
        }),
      });
      const result = await response.json();
      if (response.ok) {
        setIsSuccess(true);
        onStageChange?.('sent');
        setMessage(result.message || 'Account request submitted. Awaiting administrator approval and room assignment.');
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
      {/* 2 Step Badges: Personal details and Room preference */}
      <nav className="applicant-request-steps" aria-label="Request progress">
        <span aria-current={page === 'personal' || page === 'account' ? 'step' : undefined}>1 · Personal details</span>
        <span aria-current={page === 'rooms' ? 'step' : undefined}>2 · Room preference</span>
      </nav>

      {/* Form Page 1: Personal Information */}
      <div hidden={page !== 'personal'}>
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
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              required={page === 'personal'}
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
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              required={page === 'personal'}
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
            value={middleName}
            onChange={e => setMiddleName(e.target.value)}
          />
        </div>
        <div className="auth-field">
          <label htmlFor="request-phone">Contact Number</label>
          <PhoneInput
            id="request-phone"
            name="phone"
            placeholder="09123456789"
            autoComplete="tel"
            maxLength={30}
            value={phone}
            onChange={e => setPhone(e.target.value)}
          />
        </div>
        <fieldset className="auth-field request-gender">
          <legend>Gender</legend>
          <div className="request-gender__options">
            <label>
              <input
                type="radio"
                name="gender"
                value="male"
                required={page === 'personal'}
                checked={gender === 'male'}
                onChange={() => setGender('male')}
              />
              <span>Male</span>
            </label>
            <label>
              <input
                type="radio"
                name="gender"
                value="female"
                required={page === 'personal'}
                checked={gender === 'female'}
                onChange={() => setGender('female')}
              />
              <span>Female</span>
            </label>
          </div>
        </fieldset>

        <button className="auth-submit" type="button" onClick={handleNextToAccount}>
          Continue
        </button>
      </div>

      {/* Form Page 2: Account Information */}
      <div hidden={page !== 'account'}>
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
            value={email}
            onChange={e => setEmail(e.target.value)}
            required={page === 'account'}
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
              value={password}
              onChange={e => setPassword(e.target.value)}
              required={page === 'account'}
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
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required={page === 'account'}
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

        <div className="applicant-request-actions">
          <button className="applicant-request-back" type="button" onClick={handleBackToPersonal}>
            ← Back
          </button>
          <button className="auth-submit" type="button" onClick={handleNextToRooms}>
            Continue
          </button>
        </div>
      </div>

      {/* Form Page 3: Room Preference */}
      {page === 'rooms' && (
        <>
          <ApplicantRoomPicker
            gender={gender}
            selected={preferredRoom}
            onSelect={setPreferredRoom}
            reload={roomReload}
            title={<div className="applicant-picker__heading">
              <p className="applicant-picker__hint">Subject to administrator approval.</p>
              <h3 ref={heading} tabIndex={-1} className="auth-section-title">Choose your preferred room</h3>
            </div>}
          />
          <div className="applicant-request-actions">
            <button className="applicant-request-back" type="button" disabled={busy} onClick={handleBackToAccount}>
              ← Back
            </button>
            <button className="auth-submit" type="submit" disabled={busy || !preferredRoom} aria-busy={busy}>
              {busy ? 'Sending…' : 'Send request'}
            </button>
          </div>
        </>
      )}

      {message && (
        <p
          className="auth-form-message"
          style={isSuccess ? { borderColor: 'rgba(34, 197, 94, 0.3)', color: '#166534', background: 'rgba(34, 197, 94, 0.1)' } : undefined}
          role="status"
        >
          {message}
        </p>
      )}
    </form>
  );
}
