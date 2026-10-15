import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AD_DISMISSAL_MS, createAdDismissal } from './ad-dismissal';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('hides immediately, then restores ads after seven minutes', () => {
  const ads = createAdDismissal();
  const changed = vi.fn();
  ads.subscribe(changed);
  expect(ads.isHidden()).toBe(false);
  ads.dismiss();
  expect(ads.isHidden()).toBe(true);
  expect(changed).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(AD_DISMISSAL_MS - 1);
  expect(ads.isHidden()).toBe(true);
  vi.advanceTimersByTime(1);
  expect(ads.isHidden()).toBe(false);
  expect(changed).toHaveBeenCalledTimes(2);
});

it('keeps dismissal across navigation but starts visible in a fresh runtime', () => {
  const ads = createAdDismissal();
  const oldScreen = vi.fn();
  const leave = ads.subscribe(oldScreen);
  ads.dismiss();
  leave();
  vi.advanceTimersByTime(60_000);
  const newScreen = vi.fn();
  ads.subscribe(newScreen);
  expect(ads.isHidden()).toBe(true);
  expect(createAdDismissal().isHidden()).toBe(false);
  vi.advanceTimersByTime(AD_DISMISSAL_MS - 60_000);
  expect(newScreen).toHaveBeenCalledOnce();
  expect(oldScreen).toHaveBeenCalledOnce();
  expect(ads.isHidden()).toBe(false);
});

it('uses elapsed time when returning from a suspended app', () => {
  const ads = createAdDismissal();
  ads.dismiss();
  vi.setSystemTime(Date.now() + AD_DISMISSAL_MS + 1);
  expect(ads.isHidden()).toBe(false);
});

it('a repeat dismissal gets a full pause without an older timer restoring ads', () => {
  const ads = createAdDismissal();
  ads.dismiss();
  vi.advanceTimersByTime(60_000);
  ads.dismiss();
  vi.advanceTimersByTime(AD_DISMISSAL_MS - 60_000);
  expect(ads.isHidden()).toBe(true);
  vi.advanceTimersByTime(60_000);
  expect(ads.isHidden()).toBe(false);
});
