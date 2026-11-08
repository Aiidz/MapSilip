import 'server-only';
import { cache } from 'react';
import { requireStaffAccess } from '../server';
import { getTenantAccess } from '../tenant';
import { isStaffAuthEnabled } from '../auth/activation';
import { isTenantAuthEnabled } from '../tenant-activation';
import { BackendError } from '../security';

export const resolvePushIdentity = cache(async () => {
  if (isStaffAuthEnabled()) {
    try { return await requireStaffAccess('staff.access.inspect'); }
    catch (error) {
      if (!(error instanceof BackendError) || error.code !== 'forbidden') throw error;
    }
  }
  if (!isTenantAuthEnabled()) throw new BackendError('forbidden');
  const { identity } = await getTenantAccess();
  return { userId: identity.userId, sessionId: identity.sessionId, role: 'tenant' as const, securityRevision: null };
});
