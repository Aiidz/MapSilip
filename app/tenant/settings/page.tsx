import { InlineNotificationSettings } from '../../components/InlineNotificationSettings';
import { ProfileEditor } from '../../components/ProfileEditor';
import { SettingsPage } from '../../components/SettingsPage';
import { requireTenantAccess } from '../../lib/backend/tenant';
import { pushAvailable } from '../../lib/backend/push/config';

export default async function DeviceSettingsPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const { identity: { userId } } = await requireTenantAccess();
  const { section } = await searchParams;
  if (section === 'notifications' || section === 'device') return <SettingsPage area="tenant" section="notifications">
    <InlineNotificationSettings userId={userId} pushEnabled={pushAvailable()} />
  </SettingsPage>;
  return <SettingsPage area="tenant" section="profile"><ProfileEditor role="tenant" embedded /></SettingsPage>;
}
