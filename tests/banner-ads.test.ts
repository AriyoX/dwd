import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBannerAds, parseBannerAds } from '../apps/mobile/src/lib/banner-ads';

const campaign = {
  id: 'ride-home',
  advertiser: 'Partner',
  title: 'Your ride home',
  cta: 'Book a ride',
  url: 'https://partner.example/book',
};

afterEach(() => vi.unstubAllGlobals());

describe('public sponsor feed', () => {
  it('validates campaigns, labels sponsorship, and preserves their display order', () => {
    const ads = parseBannerAds({
      ads: [campaign, { ...campaign, id: 'weekend', tone: 'amber' }],
    });
    expect(ads?.map((ad) => [ad.id, ad.sponsored, ad.tone])).toEqual([
      ['ride-home', true, 'plum'],
      ['weekend', true, 'amber'],
    ]);
  });

  it.each([
    'javascript:alert(1)',
    'http://partner.example',
    'dwd://account',
    'https://a:b@host.test',
  ])('rejects unsupported destinations and image URLs: %s', (url) => {
    expect(parseBannerAds({ ads: [{ ...campaign, url }] })).toBeNull();
    expect(parseBannerAds({ ads: [{ ...campaign, imageUrl: url }] })).toBeNull();
  });

  it('skips malformed and duplicate campaigns without discarding valid ones', () => {
    expect(
      parseBannerAds({ ads: [null, { ...campaign, title: '' }, campaign, campaign] }),
    ).toHaveLength(1);
  });

  it('distinguishes an intentionally disabled placement from a broken feed', () => {
    expect(parseBannerAds({ ads: [] })).toEqual([]);
    expect(parseBannerAds({ ads: [null] })).toBeNull();
    expect(parseBannerAds({ items: [] })).toBeNull();
    expect(parseBannerAds({ ads: Array.from({ length: 11 }, () => campaign) })).toBeNull();
  });

  it('fetches public configuration without credentials and supports cancellation', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: () => ({ ads: [campaign] }) });
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    const ads = await loadBannerAds('https://dwd.example/ads.json', controller.signal);
    expect(fetch).toHaveBeenCalledWith('https://dwd.example/ads.json', {
      credentials: 'omit',
      signal: controller.signal,
    });
    expect(ads?.[0]?.url).toBe(campaign.url);
  });

  it('does not fetch invalid addresses and falls back on HTTP errors', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetch);
    const signal = new AbortController().signal;
    expect(await loadBannerAds('http://dwd.example/ads.json', signal)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(await loadBannerAds('https://dwd.example/ads.json', signal)).toBeNull();
  });
});
