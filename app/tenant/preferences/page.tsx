import { FeaturePreview } from '../../components/FeaturePreview';

export default function TenantPreferencesPage() {
  return <FeaturePreview
    title="Notification settings"
    description="Choose how MapSilip can keep you up to date."
    icon="bell"
    emptyTitle="Notification settings are unavailable"
    emptyDescription="Your notification preferences will appear here."
  />;
}
