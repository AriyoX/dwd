import type { NextConfig } from 'next';
import { networkInterfaces } from 'node:os';

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

// Only event pages need R2 and Turnstile. Photo upload pages allow the HEIC worker.
const photoStorageOrigin = httpsOrigin(
  process.env['R2_ENDPOINT'] ||
    (process.env['R2_ACCOUNT_ID']
      ? `https://${process.env['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com`
      : ''),
);
const eventContentSecurityPolicy = contentSecurityPolicy
  .replace(
    "script-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com 'wasm-unsafe-eval'",
  )
  .replace("img-src 'self'", `img-src 'self' ${photoStorageOrigin}`)
  .replace(
    "connect-src 'self'",
    `connect-src 'self' ${photoStorageOrigin} https://challenges.cloudflare.com`,
  )
  .concat("; frame-src https://challenges.cloudflare.com; worker-src 'self' blob:");

const nextConfig: NextConfig = {
  // Allow this computer's LAN addresses for phone testing without opening all origins.
  allowedDevOrigins: isDevelopment
    ? Object.values(networkInterfaces()).flatMap((addresses) =>
        (addresses ?? []).filter((address) => !address.internal).map((address) => address.address),
      )
    : [],
  ...(process.env.DWD_E2E === '1'
    ? { distDir: process.env['DWD_E2E_DIST_DIR'] || '.next-e2e' }
    : {}),
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
      {
        source: '/night/:nightId/summary',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy.concat("; worker-src 'self' blob:"),
          },
        ],
      },
      {
        source: '/events/the-link-up/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: eventContentSecurityPolicy },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ]);
  },
};

export default nextConfig;
