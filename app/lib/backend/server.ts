import { createSupabaseServerClient } from '../supabase/server';
import { verifyIdentity } from './identity';
import { BackendError } from './security';
import { requirePortalRole, runStaffOperation, type StaffAction, type StaffActor } from './staff-access';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Unused server entry point. Before any data operation, add proven current-access/RLS checks. */
export async function getVerifiedIdentity() {
  const client = await createSupabaseServerClient();
  return verifyIdentity(client.auth);
}

/** Use fixed action constants at call sites, never a submitted role/action selector.
 * Only a user-scoped client is passed to the operation. Its RLS/transaction must
 * independently enforce access at execution time. No administrative client exists.
 */
export async function executeStaffOperation<T>(
  action: StaffAction,
  operation: (client: SupabaseClient, actor: StaffActor) => Promise<T>,
) {
  const client = await createSupabaseServerClient();
  return runStaffOperation({
    verifyIdentity: () => verifyIdentity(client.auth),
    readSnapshot: async () => {
      const { data, error } = await client.rpc('mapsilip_staff_access_snapshot');
      if (error) throw new BackendError('unavailable');
      return data;
    },
  }, action, actor => operation(client, actor));
}

export async function requireStaffAccess(action: StaffAction) {
  return executeStaffOperation(action, async (_client, actor) => actor);
}

export async function requireStaffPortalAccess(role: StaffActor['role']) {
  return requirePortalRole(await requireStaffAccess('staff.access.inspect'), role);
}
