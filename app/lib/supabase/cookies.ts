import type { CookieOptions } from '@supabase/ssr';

type Cookie = { name: string; value: string };
type CookieWrite = Cookie & { options: CookieOptions };

/** Auth is server-mediated, so browser JavaScript does not need Supabase session tokens. */
export function supabaseSessionCookieOptions(production = process.env.NODE_ENV === 'production'): CookieOptions {
  return { path: '/', sameSite: 'lax', httpOnly: true, secure: production };
}

/** No writer means read-only rendering. Refresh must persist through a writable response. */
export function createCookieAdapter(
  read: () => Cookie[],
  write?: (name: string, value: string, options: CookieOptions) => void,
) {
  return {
    getAll: read,
    setAll(cookies: CookieWrite[]) {
      if (cookies.length === 0) return;
      // Auth must be able to reject a revoked session during read-only rendering.
      if (!write && cookies.every(cookie => cookie.value === '' && cookie.options.maxAge === 0)) return;
      if (!write) throw new Error('Session refresh requires a writable response.');
      try {
        for (const { name, value, options } of cookies) write(name, value, options);
      } catch {
        // A partial write is not success. The future handler must fail closed.
        throw new Error('Session cookies could not be persisted. Retry through a writable response.');
      }
    },
  };
}
