import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseEnvironment } from '../../supabase/env';
import { supabaseSessionCookieOptions } from '../../supabase/cookies';
import { verifyAuthSession } from '../identity';
import { BackendError } from '../security';
import type { AuthCookieWrite } from './service';

type Cookie = Readonly<{ name: string; value: string }>;
type AuthClient = Pick<SupabaseClient, 'auth'>;
type ClientFactory = (url: string, key: string, options: {
  cookies: {
    getAll(): Cookie[];
    setAll(cookies: Array<{ name: string; value: string; options: CookieOptions }>): void;
  };
  cookieOptions: CookieOptions;
  auth: { autoRefreshToken: false; persistSession: true; detectSessionInUrl: false };
}) => AuthClient;

function bufferedClient(
  initialCookies: readonly Cookie[],
  url: string,
  key: string,
  factory: ClientFactory,
) {
  const values = new Map(initialCookies.map(cookie => [cookie.name, cookie.value]));
  const writes: AuthCookieWrite[] = [];
  const client = factory(url, key, {
    cookies: {
      getAll: () => [...values].map(([name, value]) => ({ name, value })),
      setAll: changes => {
        for (const { name, value } of changes) values.set(name, value);
        for (const { name, value, options } of changes) writes.push(Object.freeze({ name, value, options }));
      },
    },
    cookieOptions: supabaseSessionCookieOptions(),
    auth: { autoRefreshToken: false, persistSession: true, detectSessionInUrl: false },
  });
  return { client, writes };
}

function verify(client: AuthClient) {
  return verifyAuthSession(client.auth);
}

/** Request-scoped Auth operations. Credentials and JWTs remain inside the SDK/client and response cookie buffer. */
export function createSupabaseAuthGateway(
  requestCookies: readonly Cookie[],
  factory: ClientFactory = createServerClient as ClientFactory,
) {
  const { url, publishableKey } = getSupabaseEnvironment();
  const current = bufferedClient(requestCookies, url, publishableKey, factory);

  const freshSignIn = async (email: string, password: string) => {
    const buffered = bufferedClient([], url, publishableKey, factory);
    const { data, error } = await buffered.client.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new BackendError('unauthenticated');
    const verified = await verify(buffered.client);
    return Object.freeze({ identity: verified.identity, cookies: Object.freeze(buffered.writes) });
  };

  return Object.freeze({
    signIn: freshSignIn,
    async verifyCurrentSession() {
      try {
        const verified = await verify(current.client);
        if (!verified.email) throw new BackendError('unauthenticated');
        return Object.freeze({ identity: verified.identity, email: verified.email });
      } catch (error) {
        if (error instanceof BackendError) throw error;
        throw new BackendError('unauthenticated');
      }
    },
    async changePassword(currentPassword: string, newPassword: string): Promise<'confirmed' | 'rejected' | 'uncertain'> {
      try {
        const { error } = await current.client.auth.updateUser({ password: newPassword, current_password: currentPassword });
        if (!error) return 'confirmed';
        return typeof error.status === 'number' && error.status >= 400 && error.status < 500 ? 'rejected' : 'uncertain';
      } catch {
        return 'uncertain';
      }
    },
    async signOutGlobally(): Promise<'confirmed' | 'uncertain'> {
      try {
        const { error } = await current.client.auth.signOut({ scope: 'global' });
        return error ? 'uncertain' : 'confirmed';
      } catch {
        return 'uncertain';
      }
    },
    async signOutCurrent() {
      try {
        const { error } = await current.client.auth.signOut({ scope: 'global' });
        return Object.freeze({ confirmed: !error, cookies: Object.freeze([...current.writes]) });
      } catch {
        return Object.freeze({ confirmed: false, cookies: Object.freeze([]) });
      }
    },
    signInFresh: freshSignIn,
  });
}
