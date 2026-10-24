import { PageHeader, Panel } from "../../components/ui";

function PreviewField({ label, type = "text" }: { label: string; type?: string }) {
  return (
    <label className="profile-preview-field">
      <span>{label}</span>
      <input type={type} disabled />
    </label>
  );
}

export default function ManagementProfilePage() {
  return (
    <>
      <PageHeader title="Profile" description="Account details and preferences." />
      <div className="profile-preview-grid">
        <Panel title="Profile details" description="Personal information for this account." icon="users">
          <div className="profile-preview-fields">
            <PreviewField label="First name" />
            <PreviewField label="Last name" />
            <PreviewField label="Email address" type="email" />
            <PreviewField label="Contact number" type="tel" />
          </div>
          <button className="profile-preview-save" disabled>Save changes</button>
        </Panel>
        <Panel title="Change password" icon="shield">
          <div className="profile-preview-fields">
            <PreviewField label="Current password" type="password" />
            <PreviewField label="New password" type="password" />
            <PreviewField label="Confirm new password" type="password" />
          </div>
          <button className="profile-preview-save" disabled>Update password</button>
        </Panel>
      </div>
    </>
  );
}
