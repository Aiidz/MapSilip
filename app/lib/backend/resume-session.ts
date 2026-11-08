import { noticeContinuation } from '../pwa/notification-navigation';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isStaffAuthEnabled } from './auth/activation';
import { isTenantAuthEnabled } from './tenant-activation';
import { requireStaffAccess } from './server';
import { getTenantAccess } from './tenant';
import { BackendError } from './security';

/** Resume saved sessions using current authority, never editable user metadata. */
export async function resumeSignedInPortal(notice?: unknown) {
  const saved = (await cookies()).getAll().some(cookie => /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name));
  if (!saved) return;
  let destination: string | undefined;
  if (isStaffAuthEnabled()) {
    try {
      const actor = await requireStaffAccess('staff.access.inspect');
      destination = actor.role === 'owner' ? '/management' : '/caretaker';
    } catch (error) {
      if (!(error instanceof BackendError)) throw error;
      if (error.code === 'unauthenticated') return;
      if (error.code !== 'forbidden') throw error;
    }
  }
  if (destination) redirect(noticeContinuation(notice) ?? destination);
  if (!isTenantAuthEnabled()) return;
  try { await getTenantAccess(); }
  catch (error) {
    if (error instanceof BackendError && ['unauthenticated', 'forbidden'].includes(error.code)) return;
    throw error;
  }
  redirect(noticeContinuation(notice) ?? '/tenant');
}
