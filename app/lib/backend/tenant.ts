import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createSupabaseServerClient } from '../supabase/server';
import { verifyAuthSession } from './identity';
import { authorizeTenantProfile } from './tenant-access';
import { BackendError } from './security';

// Request-scoped only: layouts verify access without loading room/billing data
// needed by the details page. Never share an identity between requests.
export const getTenantAccess = cache(async function getTenantAccess() {
  const client = await createSupabaseServerClient();
  const session = await verifyAuthSession(client.auth);
  const identity = session.identity;
  const { data, error } = await client.from('tenant_profiles')
    .select('user_id, display_name, phone, emergency_contact, status').eq('user_id', identity.userId).maybeSingle();
  if (error) throw new BackendError('unavailable');
  if (!data) throw new BackendError('forbidden');
  authorizeTenantProfile(identity, data);
  if (data.status !== 'active') throw new BackendError('forbidden');
  return { client, session, identity, data };
});

export const getTenantProfile = cache(async function getTenantProfile() {
  const { client, session, identity, data } = await getTenantAccess();
  const [assignment, invoice] = await Promise.all([
    client.from('room_assignments').select('room_id,started_on,rooms(room_number)')
      .eq('tenant_id', identity.userId).is('ended_on', null).maybeSingle(),
    client.from('invoices').select('coverage_start,coverage_end,amount,currency,due_on')
      .eq('tenant_id', identity.userId).order('due_on', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (assignment.error || invoice.error) throw new BackendError('unavailable');
  const room = assignment.data?.rooms as { room_number?: string } | { room_number?: string }[] | null | undefined;
  return Object.freeze({ userId: identity.userId, displayName: data.display_name, email: session.email,
    phone: data.phone, emergencyContact: data.emergency_contact,
    roomNumber: Array.isArray(room) ? room[0]?.room_number : room?.room_number,
    startedOn: assignment.data?.started_on,
    invoice: invoice.data });
});

export async function requireTenantAccess() {
  try { return await getTenantAccess(); }
  catch (error) {
    if (error instanceof BackendError && ['unauthenticated', 'forbidden'].includes(error.code)) redirect('/login');
    throw error;
  }
}
