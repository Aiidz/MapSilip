export type SupabaseEnvironment = {
  url: string;
  publishableKey: string;
};

export function getSupabaseEnvironment(): SupabaseEnvironment {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const missing = [
    !url?.trim() && 'NEXT_PUBLIC_SUPABASE_URL',
    !publishableKey?.trim() && 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `Supabase configuration is incomplete. Set ${missing.join(', ')} in .env.local using .env.example.`,
    );
  }

  try {
    const parsedUrl = new URL(url!);
    if (
      parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password ||
      parsedUrl.pathname !== '/' || parsedUrl.search || parsedUrl.hash ||
      (url !== parsedUrl.origin && url !== `${parsedUrl.origin}/`) ||
      url !== url?.trim() ||
      /your-project|replace[-_]?me|example\.(com|org|net)|\.example$/i.test(parsedUrl.hostname)
    ) {
      throw new Error();
    }
  } catch {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL must be a configured HTTPS project origin without credentials, paths or query parameters.');
  }

  // This foundation requires the current public key format. Reject all legacy
  // JWT keys, including service_role, rather than trusting decoded JWT claims.
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey!) ||
      /replace[-_]?me|your[-_]key|placeholder/i.test(publishableKey!)) {
    throw new Error('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must contain a publishable key, never a secret or legacy JWT key.');
  }

  return { url: url!, publishableKey: publishableKey! };
}
