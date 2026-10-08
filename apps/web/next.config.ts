import type { NextConfig } from 'next';

const isDevelopment = process.env.NODE_ENV === 'development';
const rawBackend: unknown = process.env['NEXT_PUBLIC_SUPABASE_URL'];
const backend = new URL(typeof rawBackend === 'string' ? rawBackend : 'http://127.0.0.1:54321');
function httpsOrigin(value: string | undefined) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.origin : '';
  } catch {
    return '';
  }
}
const adFeedOrigin = httpsOrigin(process.env['NEXT_PUBLIC_DWD_ADS_URL']);
const adImageOrigins = (process.env['NEXT_PUBLIC_DWD_AD_IMAGE_ORIGINS'] ?? '')
  .split(',')
  .map((origin) => httpsOrigin(origin.trim()))
  .filter(Boolean)
  .join(' ');
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${backend.origin} ${adImageOrigins}`,
  "font-src 'self' data:",
  `connect-src 'self' ${backend.origin} ${backend.origin.replace(/^http/, 'ws')} ${adFeedOrigin}`,
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
            value: 'camera=(), microphone=(), geolocation=(self), payment=()',
          },
        ],
      },
    ]);
  },
};

export default nextConfig;
