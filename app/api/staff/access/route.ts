import { requireStaffAccess } from '../../../lib/backend/server';
import { staffAccessResponse } from '../../../lib/backend/staff-response';
import { assertStaffAuthEnabled } from '../../../lib/backend/auth/activation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  return staffAccessResponse(async () => {
    assertStaffAuthEnabled();
    return requireStaffAccess('staff.access.inspect');
  });
}
