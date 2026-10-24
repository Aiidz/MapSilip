import { FeaturePreview } from "../../components/FeaturePreview";

export default function ManagementMaintenancePage() {
  return (
    <FeaturePreview
      title="Maintenance"
      description="A focused workspace for repair concerns and updates."
      icon="wrench"
      sectionTitle="Request overview"
      emptyTitle="No maintenance requests to display"
      emptyDescription="Maintenance requests will appear here."
    />
  );
}
