import { InlineNotificationSettings } from '../../components/InlineNotificationSettings';
import { pushAvailable } from '../../lib/backend/push/config';
import { ProfileEditor } from '../../components/ProfileEditor';
import { PaymentQrSettings } from '../../components/PaymentQrSettings';
import { SettingsPage } from '../../components/SettingsPage';
import { requireStaffPortalAccess } from '../../lib/backend/server';
import { BackupWorkspace } from '../backups/BackupWorkspace';

export default async function OwnerSettingsPage({ searchParams }: { searchParams: Promise<{ drive?: string; section?: string }> }) {
  const { userId } = await requireStaffPortalAccess('owner');
  const { drive, section } = await searchParams;
  if (section === 'backups' || drive) return <SettingsPage area="management" section="backups">
    <BackupWorkspace userId={userId} drive={drive} />
  </SettingsPage>;
  if (section === 'payments') return <SettingsPage area="management" section="payments"><PaymentQrSettings /></SettingsPage>;
  if (section === 'notifications' || section === 'device') return <SettingsPage area="management" section="notifications">
    <InlineNotificationSettings userId={userId} pushEnabled={pushAvailable()} />
  </SettingsPage>;
  return <SettingsPage area="management" section="profile"><ProfileEditor embedded /></SettingsPage>;
}
