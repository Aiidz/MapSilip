'use client';

import { ProfilePasswordForm } from './ProfilePasswordForm';
import { useEffect, useState, type FormEvent } from 'react';
import { PageHeader, Panel } from './ui';
import { Icon } from './Icon';
import { ProfilePhoto, ProfilePhotoUpload } from './ProfilePhoto';

export function ProfileEditor({ role = 'owner' }: { role?: 'owner' | 'caretaker' | 'tenant' }) {
  const tenant = role === 'tenant';
  const [profile, setProfile] = useState({ display_name: '', phone: '', emergency_contact: '', email: '' });
  const [names, setNames] = useState({ first: '', middle: '', last: '' });
  const [draftPhone, setDraftPhone] = useState('');
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('Loading profile…');
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch('/api/profile').then(async response => {
    if (!response.ok) throw new Error();
    const value = await response.json();
    const displayName = String(value.display_name || '').trim();
    const nameParts = displayName.split(/\s+/).filter(Boolean);
    setNames({ first: nameParts[0] || '', middle: nameParts.slice(1, -1).join(' '), last: nameParts.length > 1 ? nameParts[nameParts.length - 1] : '' });
    setDraftPhone(value.phone || '');
    setProfile({ display_name: displayName, phone: value.phone || '',
      emergency_contact: value.emergency_contact || '', email: value.email || '' }); setMessage('');
  }).catch(() => setMessage('Profile could not be loaded.')); }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setMessage('');
    try {
      const updated = tenant ? { ...profile, phone: draftPhone, display_name: [names.first, names.middle, names.last].map(part => part.trim()).filter(Boolean).join(' ') } : profile;
      const response = await fetch('/api/operations', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'profile.update', data: updated }) });
      if (!response.ok) throw new Error();
      setProfile(updated);
      window.dispatchEvent(new Event('mapsilip-profile-updated'));
      setEditing(false);
      setMessage('Profile saved.');
    } catch { setMessage('Profile could not be saved. Check the details and try again.'); }
    finally { setBusy(false); }
  }
  if (tenant) return <div className="tenant-profile-page tenant-profile-page--resident">
    <PageHeader title="Profile Settings" description="Manage your account information and security." />
    <div className="tenant-profile-grid"><div className="tenant-profile-forms">
      <Panel title="Personal Information" description="Update your personal and contact details.">
        <form className="tenant-profile-form tenant-profile-personal-form" onSubmit={save}>
          <label>First Name<input required maxLength={80} autoComplete="given-name" readOnly={!editing} value={names.first} onChange={event => setNames({ ...names, first: event.target.value })} /></label>
          <label>Email Address<input readOnly type="email" value={profile.email} /></label>
          <label>Middle Name<input maxLength={80} autoComplete="additional-name" readOnly={!editing} value={names.middle} onChange={event => setNames({ ...names, middle: event.target.value })} /></label>
          <label>Contact Number<input maxLength={30} autoComplete="tel" readOnly={!editing} value={draftPhone} onChange={event => setDraftPhone(event.target.value)} /></label>
          <label>Last Name<input maxLength={80} autoComplete="family-name" readOnly={!editing} value={names.last} onChange={event => setNames({ ...names, last: event.target.value })} /></label>
          <div className="tenant-profile-form-actions">
            {editing ? <><button className="button button--secondary" type="button" onClick={() => { const parts = profile.display_name.trim().split(/\s+/).filter(Boolean); setNames({ first: parts[0] || '', middle: parts.slice(1, -1).join(' '), last: parts.length > 1 ? parts[parts.length - 1] : '' }); setDraftPhone(profile.phone); setEditing(false); setMessage(''); }}>Cancel</button><button className="button button--secondary" disabled={busy}>{busy ? 'Saving…' : 'Save Changes'}</button></>
              : <button className="button button--secondary" type="button" onClick={() => setEditing(true)}>Edit Information</button>}
          </div>
        </form>
        {message && <p className="tenant-profile-message" role="status">{message}</p>}
      </Panel>
      <Panel title="Change Password" description="Update your password to keep your account secure.">
        <ProfilePasswordForm />
      </Panel>
    </div><aside className="tenant-profile-summary"><div className="profile-identity"><ProfilePhoto className="tenant-avatar-placeholder" fallback={<Icon name="users" />} />
      <h2>{profile.display_name || 'Profile'}</h2><p>Tenant</p></div>
      <dl><div><dt>Full Name</dt><dd>{profile.display_name || '—'}</dd></div><div><dt>Email Address</dt><dd>{profile.email || '—'}</dd></div>
        <div><dt>Contact Number</dt><dd>{profile.phone || '—'}</dd></div><div><dt>Account Role</dt><dd>Tenant</dd></div><div><dt>Account Status</dt><dd>Active</dd></div></dl>
      <ProfilePhotoUpload />
    </aside></div>
  </div>;
  return <div className={`tenant-profile-page${role === 'owner' ? ' management-profile-page' : ''}`}><PageHeader title="Profile Settings" description="Manage your account information and security." />
    <div className="tenant-profile-grid"><div className="tenant-profile-forms">
      <Panel title="Personal Information" description="Update your personal and contact details." icon="users">
        <form className="tenant-profile-form" onSubmit={save}>
          <label>Full name<input required maxLength={80} autoComplete="name" value={profile.display_name}
            onChange={event => setProfile({ ...profile, display_name: event.target.value })} /></label>
          <label>Email address<input readOnly type="email" value={profile.email} /></label>
          <label>Contact number<input maxLength={30} autoComplete="tel" value={profile.phone}
            onChange={event => setProfile({ ...profile, phone: event.target.value })} /></label>
          {tenant && <label>Emergency contact<input maxLength={160} value={profile.emergency_contact}
            onChange={event => setProfile({ ...profile, emergency_contact: event.target.value })} /></label>}
          <button className="button button--primary" disabled={busy}>{busy ? 'Saving…' : 'Save Changes'}</button>
        </form><p role="status">{message}</p>
      </Panel>
      <Panel title="Change Password" description="Keep your account secure." icon="shield">
        <ProfilePasswordForm />
      </Panel>
    </div><aside className="tenant-profile-summary"><div className="profile-identity"><ProfilePhoto className="tenant-avatar-placeholder" fallback={<Icon name="users" />} />
      <h2>{profile.display_name || 'Profile'}</h2><p>{role === 'owner' ? 'Administrator' : role === 'caretaker' ? 'Caretaker' : 'Tenant'}</p></div>
      <dl><div><dt>Full name</dt><dd>{profile.display_name || '—'}</dd></div><div><dt>Email address</dt><dd>{profile.email || '—'}</dd></div>
        <div><dt>Contact number</dt><dd>{profile.phone || '—'}</dd></div><div><dt>Account role</dt><dd>{role === 'owner' ? 'Administrator' : role === 'caretaker' ? 'Caretaker' : 'Tenant'}</dd></div></dl>
      <ProfilePhotoUpload />
    </aside></div>
  </div>;
}
