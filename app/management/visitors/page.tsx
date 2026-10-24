import { FeaturePreview } from "../../components/FeaturePreview";

export default function ManagementVisitorsPage() {
  return (
    <FeaturePreview
      title="Visitors"
      description="A simple, scannable view of planned visit details."
      icon="calendar"
      sectionTitle="Planned visits"
      emptyTitle="No planned visits to display"
      emptyDescription="Planned visits will appear here."
    />
  );
}
