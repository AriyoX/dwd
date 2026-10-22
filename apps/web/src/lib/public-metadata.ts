import type { Metadata } from 'next';
import { resolveSiteUrl } from './site-url';

export const publicPaths = ['/', '/events', '/privacy', '/terms', '/support', '/safety'] as const;

export function canIndexPublicSite(environment: Record<string, string | undefined>) {
  const origin = new URL(resolveSiteUrl(environment));
  return (
    environment['NODE_ENV'] === 'production' &&
    environment['VERCEL_ENV'] !== 'preview' &&
    origin.protocol === 'https:'
  );
}

export function publicMetadata(
  title: string,
  description: string,
  path: (typeof publicPaths)[number],
): Metadata {
  const index = canIndexPublicSite(process.env);
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: { index, follow: true },
    openGraph: {
      title: `${title} · DWD`,
      description,
      url: path,
      siteName: 'DWD',
      type: 'website',
      locale: 'en_GB',
      images: [
        { url: '/share-image', width: 1200, height: 630, alt: 'DWD — Your night. Your own pace.' },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} · DWD`,
      description,
      images: [{ url: '/share-image', alt: 'DWD — Your night. Your own pace.' }],
    },
  };
}
