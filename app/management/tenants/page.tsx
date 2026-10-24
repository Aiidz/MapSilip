import { FeaturePreview } from "../../components/FeaturePreview";

export default function ManagementTenantsPage() {
  return (
    <FeaturePreview
      title="Tenants"
      description="A careful home for applications and tenant information."
      icon="users"
      sectionTitle="People overview"
      emptyTitle="No tenant records to display"
      emptyDescription="Tenant and application records will appear here."
    />
  );
}
