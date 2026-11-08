import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/sw.js', headers: [
      { key: 'Cache-Control', value: 'no-store' },
      { key: 'Service-Worker-Allowed', value: '/' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
    ] }];
  },
  outputFileTracingIncludes: {
    '/*': ['./.certs/supabase-root.crt'],
  },
};

export default nextConfig;
