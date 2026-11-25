import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import { existsSync } from 'node:fs';

const supabaseRootCertificate = './.certs/supabase-root.crt';

const nextConfig: NextConfig = {
  experimental: {
    agentUpgrade: 'security',
  },
  poweredByHeader: false,
  async headers() {
    return [{ source: '/sw.js', headers: [
      { key: 'Cache-Control', value: 'no-store' },
      { key: 'Service-Worker-Allowed', value: '/' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
    ] }];
  },
  outputFileTracingIncludes: {
    '/*': [supabaseRootCertificate],
  },
};

export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD && !existsSync(supabaseRootCertificate)) {
    throw new Error('The production build requires .certs/supabase-root.crt for Supabase authentication. Include the public certificate in the deployment source.');
  }
  return nextConfig;
}
