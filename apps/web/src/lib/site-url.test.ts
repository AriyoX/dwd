import { describe, expect, it } from 'vitest';
import { resolveSiteUrl } from './site-url';

describe('deployment origins', () => {
  it('keeps preview auth and invite links on the preview deployment', () => {
    expect(
      resolveSiteUrl({
        VERCEL: '1',
        VERCEL_ENV: 'preview',
        VERCEL_URL: 'dwd-review.vercel.app',
        NEXT_PUBLIC_SITE_URL: 'https://dwd.example',
      }),
    ).toBe('https://dwd-review.vercel.app');
  });
  it('uses the canonical domain in production and removes a trailing slash', () => {
    expect(
      resolveSiteUrl({ VERCEL: '1', NEXT_PUBLIC_SITE_URL: 'https://dwd.example/' }),
    ).toBe('https://dwd.example');
  });
  it('supports the initial Vercel deployment before a custom domain is configured', () => {
    expect(resolveSiteUrl({ VERCEL: '1', VERCEL_URL: 'dwd.vercel.app' })).toBe(
      'https://dwd.vercel.app',
    );
  });
  it.each([
    'http://dwd.example',
    'javascript:alert(1)',
    'http://localhost:3000',
    'https://user:password@example.com',
  ])('rejects an invalid hosted origin: %s', (url) => {
    expect(() => resolveSiteUrl({ VERCEL: '1', NEXT_PUBLIC_SITE_URL: url })).toThrow();
  });
  it('only defaults to localhost outside Vercel', () => {
    expect(resolveSiteUrl({})).toBe('http://localhost:3000');
    expect(() => resolveSiteUrl({ VERCEL: '1' })).toThrow();
  });
});
