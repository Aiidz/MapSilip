import { redirect } from 'next/navigation';
import { requireStaffAccess } from '../../lib/backend/server';

// Preserve existing notification links without retaining a separate workspace.
export default async function StorageManagementPage() {
  await requireStaffAccess('finance.read');
  redirect('/management?export=1');
}
