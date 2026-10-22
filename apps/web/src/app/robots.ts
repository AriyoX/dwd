import type { MetadataRoute } from 'next';
import { canIndexPublicSite } from '@/lib/public-metadata';
import { resolveSiteUrl } from '@/lib/site-url';

export default function robots(): MetadataRoute.Robots {
  if (!canIndexPublicSite(process.env)) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Pages behind sign-in also retain the root layout's noindex metadata.
      disallow: [
        '/api/',
        '/auth/',
        '/home',
        '/account',
        '/history',
        '/night/',
        '/join/',
        '/feedback',
        '/demo',
        '/quick-log',
        '/login',
        '/signup',
        '/complete-signup',
        '/confirmation-help',
        '/forgot-password',
        '/reset-password',
        '/delete-account',
        '/events/admin',
        '/events/the-link-up',
      ],
    },
    sitemap: `${resolveSiteUrl(process.env)}/sitemap.xml`,
  };
}
