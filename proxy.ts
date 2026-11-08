import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseEnvironment } from './app/lib/supabase/env';
import { supabaseSessionCookieOptions } from './app/lib/supabase/cookies';
import { refreshSupabaseSession, requiresPrivateNoStore } from './app/lib/supabase/proxy';

export async function proxy(request: NextRequest) {
  const hasPartialConfiguration = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  if (!hasPartialConfiguration) return NextResponse.next({ request });

  let environment: ReturnType<typeof getSupabaseEnvironment>;
  try { environment = getSupabaseEnvironment(); }
  catch {
    // Keep the credential-free preview renderable. Auth and data services validate independently and deny.
    return NextResponse.next({ request });
  }

  const response = NextResponse.next({ request });
  await refreshSupabaseSession(request, response, options => createServerClient(
    environment.url,
    environment.publishableKey,
    { ...options, cookieOptions: supabaseSessionCookieOptions(),
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } },
  ));

  if (requiresPrivateNoStore(request.cookies.getAll().map(cookie => cookie.name), response.cookies.getAll().length)) {
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Vary', 'Cookie');
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
