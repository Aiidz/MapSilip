type CookieOptions = Record<string, unknown>;
type CookieWrite = Readonly<{ name: string; value: string; options: CookieOptions }>;
type ProxyRequest = { cookies: { getAll(): Array<{ name: string; value: string }>; set(name: string, value: string): unknown } };
type ProxyResponse = { cookies: { set(name: string, value: string, options: CookieOptions): unknown } };
type SupabaseFactory = (options: { cookies: {
  getAll(): Array<{ name: string; value: string }>;
  setAll(cookies: CookieWrite[]): void;
} }) => { auth: { getClaims(): Promise<unknown> } };

/** Refresh only; no role or authorization decisions are made in Proxy. */
export async function refreshSupabaseSession(
  request: ProxyRequest,
  response: ProxyResponse,
  createClient: SupabaseFactory,
) {
  try {
    const client = createClient({ cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: changes => {
        for (const { name, value } of changes) request.cookies.set(name, value);
        for (const { name, value, options } of changes) response.cookies.set(name, value, options);
      },
    } });
    await client.auth.getClaims();
  } catch {
    // A proxy refresh failure is not authorization. Protected server operations still verify access.
  }
  return response;
}

/** A cookie-bearing Supabase response must not enter a shared personalized cache. */
export function requiresPrivateNoStore(cookieNames: readonly string[], responseCookieCount: number) {
  return responseCookieCount > 0 || cookieNames.some(name => /^sb-.+-auth-token(?:\.\d+)?$/.test(name));
}
