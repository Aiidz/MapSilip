"use client";

import { PageHeader, Panel } from "../../components/ui";

export default function TenantProfilePage() {
  return <div className="tenant-profile-page">
    <PageHeader title="Profile Settings" description="Manage your personal and account information." />
    <div className="tenant-profile-grid">
      <div className="tenant-profile-forms">
        <Panel title="Personal Information" description="Update your contact details." icon="users">
          <form onSubmit={(event) => event.preventDefault()} className="tenant-profile-form">
            <label>Full name<input autoComplete="name" placeholder="Full name" /></label>
            <label>Email address<input type="email" autoComplete="email" placeholder="Email address" /></label>
            <label>Phone number<input type="tel" autoComplete="tel" placeholder="Phone number" /></label>
            <label>Emergency contact<input type="tel" placeholder="Emergency contact" /></label>
            <button className="button button--primary tenant-disabled-action" type="button" disabled>Save Changes</button>
          </form>
        </Panel>
        <Panel title="Change Password" description="Keep your account secure." icon="shield">
          <form onSubmit={(event) => event.preventDefault()} className="tenant-profile-form">
            <label>Current password<input type="password" autoComplete="current-password" placeholder="Current password" /></label>
            <label>New password<input type="password" autoComplete="new-password" placeholder="New password" /></label>
            <label>Confirm new password<input type="password" autoComplete="new-password" placeholder="Confirm new password" /></label>
            <button className="button button--secondary tenant-disabled-action" type="button" disabled>Update Password</button>
          </form>
        </Panel>
      </div>
      <aside className="tenant-profile-summary">
        <div className="tenant-avatar-placeholder" aria-hidden="true">—</div>
        <h2>Profile</h2><p>Your account details will appear here.</p>
        <button className="button button--secondary tenant-disabled-action" disabled type="button">Change Photo</button>
      </aside>
    </div>
  </div>;
}
