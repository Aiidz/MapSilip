import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseEnvironment } from './env';
import { createCookieAdapter, supabaseSessionCookieOptions } from './cookies';

export async function createSupabaseServerClient(cookieAccess: 'read-only' | 'read-write' = 'read-only') {
  const { url, publishableKey } = getSupabaseEnvironment();
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookieOptions: supabaseSessionCookieOptions(),
    cookies: createCookieAdapter(
      () => cookieStore.getAll(),
      cookieAccess === 'read-write'
        ? (name, value, options) => cookieStore.set(name, value, options)
        : undefined,
    ),
  });
}
