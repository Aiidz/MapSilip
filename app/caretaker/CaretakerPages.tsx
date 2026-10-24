"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { EmptyState, PageHeader, Panel } from "../components/ui";

const requestSummary = ["Total Requests", "Pending", "In Progress", "Urgent Requests"];
const requestFilters = ["All", "Pending", "In Progress", "Resolved"];
const notificationFilters = ["All", "Unread", "Read"];

export function CaretakerDashboard() {
  return <div className="caretaker-dashboard">
    <PageHeader title="Dashboard" description="Monitor and respond to tenant maintenance requests." />
    <section className="caretaker-summary" aria-label="Maintenance request summary">
      {requestSummary.map((label) => <article className="caretaker-summary__card" key={label}>
        <div><h2>{label}</h2><span aria-label="Unavailable">—</span><p>No data available</p></div>
        <span className="caretaker-summary__icon" aria-hidden="true"><Icon name="arrow" /></span>
      </article>)}
    </section>
    <Panel title="Recent Maintenance Requests" className="caretaker-panel" >
      <EmptyState title="No maintenance requests to display" description="New requests will appear here when available." icon="wrench" />
    </Panel>
  </div>;
}

export function CaretakerMaintenance() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  return <div className="caretaker-workspace">
    <PageHeader title="Maintenance Requests" description="Review tenant repair reports and their progress." />
    <label className="caretaker-search">
      <Icon name="search" />
      <span className="sr-only">Search maintenance requests</span>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by category, room, or tenant" />
    </label>
    <div className="caretaker-filters" role="group" aria-label="Filter maintenance requests">
      {requestFilters.map((item) => <button type="button" key={item} aria-pressed={filter === item} className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>{item}</button>)}
    </div>
    <div className="caretaker-maintenance-layout">
      <Panel title="Request List" className="caretaker-request-list">
        <EmptyState title="No requests to display" description={query ? "No matching requests are available." : "Maintenance requests will appear here."} icon="wrench" />
      </Panel>
      <Panel title="Maintenance Details" className="caretaker-request-details">
        <EmptyState title="No request selected" description="Select a maintenance request to view its details." icon="fileSearch" />
      </Panel>
    </div>
  </div>;
}

export function CaretakerNotifications() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  return <div className="caretaker-workspace">
    <PageHeader title="Notifications" description="Updates about maintenance requests and account activity." />
    <div className="caretaker-notification-tools">
      <label className="caretaker-search">
        <Icon name="search" />
        <span className="sr-only">Search notifications</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notifications" />
      </label>
      <div className="caretaker-filters" role="group" aria-label="Filter notifications">
        {notificationFilters.map((item) => <button type="button" key={item} aria-pressed={filter === item} className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>{item}</button>)}
      </div>
    </div>
    <Panel title="Recent Notifications" className="caretaker-panel">
      <EmptyState title="No notifications to display" description={query ? "No matching notifications are available." : "New notifications will appear here."} icon="bell" />
    </Panel>
  </div>;
}

function ProfileField({ label, type = "text", disabled = false }: { label: string; type?: string; disabled?: boolean }) {
  return <label className="caretaker-profile-field"><span>{label}</span><input type={type} placeholder="Not provided" disabled={disabled} autoComplete="off" /></label>;
}

export function CaretakerProfile() {
  const [editing, setEditing] = useState(false);
  function preventSave(event: FormEvent<HTMLFormElement>) { event.preventDefault(); }
  return <div className="caretaker-workspace caretaker-profile">
    <PageHeader title="Profile Settings" description="Manage your account information and security." />
    <div className="caretaker-profile-grid">
      <div className="caretaker-profile-forms">
        <Panel title="Personal Information" description="Update your personal and contact details." icon="users">
          <form className="caretaker-profile-form" onSubmit={preventSave}>
            <ProfileField label="First name" disabled={!editing} />
            <ProfileField label="Email address" type="email" disabled={!editing} />
            <ProfileField label="Middle name" disabled={!editing} />
            <ProfileField label="Contact number" type="tel" disabled={!editing} />
            <ProfileField label="Last name" disabled={!editing} />
            <div className="caretaker-profile-actions">
              <button className="button button--secondary" type="button" onClick={() => setEditing((current) => !current)}>{editing ? "Cancel edit" : "Edit information"}</button>
              <button className="button button--primary" type="submit" disabled>Save changes</button>
            </div>
          </form>
        </Panel>
        <Panel title="Change Password" description="Update your password to keep your account secure." icon="shield">
          <form className="caretaker-profile-form caretaker-password-form" onSubmit={preventSave}>
            <ProfileField label="Current password" type="password" />
            <ProfileField label="New password" type="password" />
            <ProfileField label="Confirm password" type="password" />
            <div className="caretaker-profile-actions"><button className="button button--secondary" type="submit" disabled>Update password</button></div>
          </form>
        </Panel>
      </div>
      <aside className="caretaker-profile-summary">
        <span className="caretaker-profile-avatar" aria-hidden="true">C</span>
        <strong>Caretaker account</strong>
        <dl><div><dt>Account role</dt><dd>Caretaker</dd></div><div><dt>Account details</dt><dd>Unavailable</dd></div></dl>
        <button className="button button--secondary" type="button" disabled>Change photo</button>
      </aside>
    </div>
  </div>;
}
