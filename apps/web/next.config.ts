import type { NextConfig } from 'next';

const isDevelopment = process.env.NODE_ENV === 'development';
const localBackend = new URL(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
);
const localConnections =
  isDevelopment && ['127.0.0.1', 'localhost'].includes(localBackend.hostname)
    ? ` ${localBackend.origin} ${localBackend.origin.replace(/^http/, 'ws')}`
    : '';
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co${localConnections}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  ...(process.env.DWD_E2E === '1' ? { distDir: '.next-e2e' } : {}),
  reactStrictMode: true,
  transpilePackages: ['@dwd/core', '@dwd/contracts', '@dwd/data'],
  poweredByHeader: false,
  headers() {
    return Promise.resolve([
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
    ]);
  },
};

export default nextConfig;
