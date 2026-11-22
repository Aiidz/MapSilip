import { StorageManagementWorkspace } from '../../components/StorageManagementWorkspace';
import { requireStaffPortalAccess } from '../../lib/backend/server';
import { storageEnabled } from '../../lib/storage/server';

export default async function StorageManagementPage() {
  await requireStaffPortalAccess('owner');
  return <StorageManagementWorkspace enabled={storageEnabled()} />;
}
