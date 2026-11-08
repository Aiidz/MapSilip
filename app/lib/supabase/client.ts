'use client';

import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseEnvironment } from './env';

export function createSupabaseBrowserClient() {
  const { url, publishableKey } = getSupabaseEnvironment();
  return createBrowserClient(url, publishableKey);
}
