import { afterEach, describe, expect, it, vi } from 'vitest';
import { canIndexPublicSite, publicMetadata } from '../apps/web/src/lib/public-metadata';
import robots from '../apps/web/src/app/robots';
import sitemap from '../apps/web/src/app/sitemap';

afterEach(() => vi.unstubAllEnvs());

function production() {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://dwd.example');
}

describe('public discovery', () => {
  it('indexes only an HTTPS production site', () => {
    expect(
      canIndexPublicSite({ NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://dwd.example' }),
    ).toBe(true);
    expect(
      canIndexPublicSite({ NODE_ENV: 'development', NEXT_PUBLIC_SITE_URL: 'https://dwd.example' }),
    ).toBe(false);
    expect(
      canIndexPublicSite({ NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' }),
    ).toBe(false);
    expect(
      canIndexPublicSite({
        NODE_ENV: 'production',
        VERCEL_ENV: 'preview',
        VERCEL_URL: 'preview.example',
        NEXT_PUBLIC_SITE_URL: 'https://dwd.example',
      }),
    ).toBe(false);
  });

  it('publishes canonical public pages without account, invitation or album URLs', () => {
    production();
    expect(sitemap().map(({ url }) => url)).toEqual([
      'https://dwd.example/',
      'https://dwd.example/events',
      'https://dwd.example/privacy',
      'https://dwd.example/terms',
      'https://dwd.example/support',
      'https://dwd.example/safety',
    ]);
    const directives = robots();
    expect(directives.sitemap).toBe('https://dwd.example/sitemap.xml');
    expect(directives.rules).toMatchObject({
      allow: '/',
      disallow: expect.arrayContaining([
        '/api/',
        '/night/',
        '/join/',
        '/events/admin',
        '/events/the-link-up',
      ]),
    });
    expect(publicMetadata('Events', 'Event memories.', '/events')).toMatchObject({
      alternates: { canonical: '/events' },
      robots: { index: true, follow: true },
      openGraph: {
        url: '/events',
        images: [expect.objectContaining({ url: '/share-image', width: 1200, height: 630 })],
      },
      twitter: { card: 'summary_large_image' },
    });
  });

  it('does not advertise a preview deployment to search engines', () => {
    production();
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_URL', 'review.example');
    expect(robots()).toEqual({ rules: { userAgent: '*', disallow: '/' } });
    expect(sitemap()).toEqual([]);
    expect(publicMetadata('Events', 'Event memories.', '/events').robots).toMatchObject({
      index: false,
    });
  });
});
