import type { MetadataRoute } from 'next';
import { canIndexPublicSite, publicPaths } from '@/lib/public-metadata';
import { resolveSiteUrl } from '@/lib/site-url';

export default function sitemap(): MetadataRoute.Sitemap {
  if (!canIndexPublicSite(process.env)) return [];
  return publicPaths.map((path) => ({ url: new URL(path, resolveSiteUrl(process.env)).href }));
}
