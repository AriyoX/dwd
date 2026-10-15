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
  description: z.string().trim().min(1).max(100).optional(),
  supportingText: z.string().trim().min(1).max(80).optional(),
  cta: z.string().trim().min(1).max(30),
  url: httpsUrl,
  imageUrl: httpsUrl.optional(),
  tone: z.enum(['plum', 'blue', 'amber', 'forest']).default('plum'),
  sponsored: z.boolean().default(true),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
});

export interface BannerAd {
  id: string;
  advertiser: string;
  title: string;
  description?: string | undefined;
  supportingText?: string | undefined;
  cta: string;
  tone: 'plum' | 'blue' | 'amber' | 'forest';
  sponsored: boolean;
  expiresAt?: string | undefined;
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

export function parseBannerAds(value: unknown, now = Date.now()): BannerAd[] | null {
  const feed = z.object({ ads: z.array(z.unknown()).max(10) }).safeParse(value);
  if (!feed.success) return null;
  const seen = new Set<string>();
  const ads: BannerAd[] = [];
  for (const entry of feed.data.ads) {
    const parsed = sponsoredBannerSchema.safeParse(entry);
    if (!parsed.success || seen.has(parsed.data.id)) continue;
    seen.add(parsed.data.id);
    if (parsed.data.expiresAt && Date.parse(parsed.data.expiresAt) <= now) continue;
    ads.push(parsed.data);
  }
  // An explicitly empty feed disables the placement; a broken feed keeps house banners.
  // Valid expired campaigns leave an empty placement rather than triggering a fallback.
  return feed.data.ads.length && !seen.size ? null : ads;
}
