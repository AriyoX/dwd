import { isPublicHttpsUrl, parseBannerAds } from '@dwd/core';

export { HOUSE_BANNERS, parseBannerAds, type BannerAd } from '@dwd/core';

export async function loadBannerAds(feedUrl: string, signal: AbortSignal) {
  if (!isPublicHttpsUrl(feedUrl)) return null;
  const response = await fetch(feedUrl, { signal, credentials: 'omit' });
  if (!response.ok) return null;
  const value: unknown = await response.json();
  return parseBannerAds(value);
}
