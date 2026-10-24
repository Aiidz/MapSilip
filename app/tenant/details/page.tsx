import { PageHeader, Panel } from "../../components/ui";
import { Icon } from "../../components/Icon";

function DetailRow({ label }: { label: string }) {
  return <div className="tenant-detail-row"><span>{label}</span><strong>—</strong></div>;
}

export default function TenantDetailsPage() {
  return <div className="tenant-details-page">
    <PageHeader title="My Details" description="Your personal and stay information." />
    <div className="tenant-details-grid">
      <Panel title="Personal Information" description="Your contact details." icon="users">
        <div className="tenant-detail-list"><DetailRow label="Full name" /><DetailRow label="Email address" /><DetailRow label="Phone number" /><DetailRow label="Emergency contact" /></div>
      </Panel>
      <Panel title="Contract Details" description="Information about your current stay." icon="fileSearch">
        <div className="tenant-detail-list"><DetailRow label="Room" /><DetailRow label="Contract period" /><DetailRow label="Rent" /><DetailRow label="Status" /></div>
        <button className="button button--secondary tenant-disabled-action" disabled type="button"><Icon name="download" /> Rental Contract</button>
      </Panel>
    </div>
    <section className="tenant-update-request"><div><h2>Need to update your details?</h2><p>Contact the dormitory team to request a change.</p></div><button className="button button--primary tenant-disabled-action" disabled type="button">Request an Update</button></section>
  </div>;
}
