import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseEnvironment } from '../../supabase/env';
import { BackendError } from '../security';

/** Only the boolean result leaves the server; never return Auth user records. */
export async function recoveryEmailExists(email: string) {
  const { url, publishableKey } = getSupabaseEnvironment();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || key === publishableKey || key.startsWith('sb_publishable_')) throw new BackendError('unavailable');
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  // Auth Admin has no supported email filter. Bound the scan and fail closed
  // rather than incorrectly claiming an address is missing if the limit is hit.
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new BackendError('unavailable');
    if (data.users.some(user => user.email?.toLowerCase() === email)) return true;
    if (data.users.length < 1000) return false;
  }
  throw new BackendError('unavailable');
}
