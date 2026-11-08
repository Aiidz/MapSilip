import { Icon } from "../../components/Icon";
import Link from 'next/link';
import { getTenantProfile } from "../../lib/backend/tenant";

const show = (value?: string | null) => value || '—';
function Field({ label, value }: { label: string; value?: string | null }) {
  return <div className="tenant-details-field"><dt>{label}</dt><dd>{show(value)}</dd></div>;
}

export default async function TenantDetailsPage() {
  const profile = await getTenantProfile();
  const initials = profile.displayName?.trim().split(/\s+/).slice(0, 2).map((part: string) => part[0]).join('').toUpperCase() || 'T';
  return <div className="tenant-details-page tenant-my-details">
    <header className="tenant-details-heading"><h1>My Details</h1><p>View your personal information, room and contract.</p></header>
    <section className="tenant-details-identity"><span>{initials}</span><div><strong>{show(profile.displayName)}</strong><small>Tenant ID: {profile.userId}</small></div></section>
    <div className="tenant-my-details-grid">
      <section className="tenant-my-details-card"><h2>Personal Information</h2>
        <dl><Field label="Full Name" value={profile.displayName} /><Field label="Contact Number" value={profile.phone} /><Field label="Email Address" value={profile.email} /><Field label="Home Address" /><Field label="Tenant ID" value={profile.userId} /></dl>
        <hr /><h3>Emergency Contact</h3><dl><Field label="Contact Name" value={profile.emergencyContact} /><Field label="Relationship" /><Field label="Contact Number" /></dl>
        <aside className="tenant-details-update"><Icon name="info" /><div><strong>Need to update your information?</strong><p>Please contact the dormitory admin for changes to your personal details.</p><Link href="/tenant/profile" className="button button--secondary">Request an Update</Link></div></aside>
      </section>
      <section className="tenant-my-details-card tenant-contract-card"><h2>Contract Details</h2><dl>
        <Field label="Room Assignment" value={profile.roomNumber ? `Room ${profile.roomNumber}` : null} /><Field label="Contract Start Date" value={profile.startedOn} /><Field label="Contract End Date" /><Field label="Monthly Rent" value={profile.invoice ? `${profile.invoice.currency} ${profile.invoice.amount}` : null} /><Field label="Contract Status" />
      </dl><div className="tenant-contract-document"><Icon name="fileSearch" /><span>Rental contract not linked</span></div></section>
    </div>
  </div>;
}
