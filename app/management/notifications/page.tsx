import { FeaturePreview } from "../../components/FeaturePreview";

export default function ManagementNotificationsPage() {
  return (
    <FeaturePreview
      title="Notifications"
      description="A dependable place for in-app updates and useful reminders."
      icon="bell"
      sectionTitle="Recent updates"
      emptyTitle="No notifications to display"
      emptyDescription="New updates will appear here."
    />
  );
}
