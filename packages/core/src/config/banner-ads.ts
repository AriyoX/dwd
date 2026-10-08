import { z } from 'zod';

export function isPublicHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

const httpsUrl = z.string().trim().max(2048).refine(isPublicHttpsUrl);
const sponsoredBannerSchema = z.object({
  id: z.string().trim().min(1).max(80),
  advertiser: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(80),
  cta: z.string().trim().min(1).max(30),
  url: httpsUrl,
  imageUrl: httpsUrl.optional(),
  tone: z.enum(['plum', 'blue', 'amber']).default('plum'),
});

export interface BannerAd {
  id: string;
  advertiser: string;
  title: string;
  cta: string;
  tone: 'plum' | 'blue' | 'amber';
  sponsored: boolean;
  url?: string;
  imageUrl?: string | undefined;
  route?: '/night/new' | '/join' | '/history';
}

// House banners fill unsold space without presenting fictional sponsors as paid ads.
export const HOUSE_BANNERS: BannerAd[] = [
  {
    id: 'dwd-plan',
    advertiser: 'DWD',
    title: 'A little plan.\nA night of your own.',
    cta: 'Start a night',
    route: '/night/new',
    tone: 'plum',
    sponsored: false,
  },
  {
    id: 'dwd-together',
    advertiser: 'DWD',
    title: 'Your night.\nYour people.',
    cta: 'Join your friends',
    route: '/join',
    tone: 'blue',
    sponsored: false,
  },
  {
    id: 'dwd-memories',
    advertiser: 'DWD',
    title: 'Keep the moments.\nRevisit your nights.',
    cta: 'View memories',
    route: '/history',
    tone: 'amber',
    sponsored: false,
  },
];

export function parseBannerAds(value: unknown): BannerAd[] | null {
  const feed = z.object({ ads: z.array(z.unknown()).max(10) }).safeParse(value);
  if (!feed.success) return null;
  const seen = new Set<string>();
  const ads: BannerAd[] = [];
  for (const entry of feed.data.ads) {
    const parsed = sponsoredBannerSchema.safeParse(entry);
    if (!parsed.success || seen.has(parsed.data.id)) continue;
    seen.add(parsed.data.id);
    ads.push({ ...parsed.data, sponsored: true });
  }
  // An explicitly empty feed disables the placement; a broken feed keeps house banners.
  return feed.data.ads.length && !ads.length ? null : ads;
}
