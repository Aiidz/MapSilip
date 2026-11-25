import { InlineNotificationSettings } from '../../components/InlineNotificationSettings';
import { ProfileEditor } from '../../components/ProfileEditor';
import { SettingsPage } from '../../components/SettingsPage';
import { requireStaffPortalAccess } from '../../lib/backend/server';
import { pushAvailable } from '../../lib/backend/push/config';

export default async function DeviceSettingsPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const { userId } = await requireStaffPortalAccess('caretaker');
  const { section } = await searchParams;
  if (section === 'notifications' || section === 'device') return <SettingsPage area="caretaker" section="notifications">
    <InlineNotificationSettings userId={userId} pushEnabled={pushAvailable()} />
  </SettingsPage>;
  return <SettingsPage area="caretaker" section="profile"><ProfileEditor role="caretaker" embedded /></SettingsPage>;
}
