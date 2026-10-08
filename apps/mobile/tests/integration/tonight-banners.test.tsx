/* eslint-disable @typescript-eslint/no-deprecated -- Verify ad delivery and native interactions without an ad account. */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TonightBanners } from '@/components/tonight-banners';

const runtime = vi.hoisted(() => ({
  push: vi.fn(),
  open: vi.fn(),
  scroll: vi.fn(),
  fetch: vi.fn(),
  reduced: false,
}));
vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Image: 'Image',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  Linking: { openURL: runtime.open },
}));
vi.mock('expo-router', async () => {
  const { useEffect } = await import('react');
  return {
    useRouter: () => ({ push: runtime.push }),
    useFocusEffect: (effect: Parameters<typeof useEffect>[0]) => useEffect(effect, [effect]),
  };
});
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('react-native-reanimated', () => ({ useReducedMotion: () => runtime.reduced }));
vi.mock('@/components/primary-button', () => ({ Action: 'Action' }));
vi.mock('@/components/screen', () => ({ Notice: 'Notice' }));
vi.mock('@/providers/theme-provider', async () => {
  const { lightColors } = await import('@/theme/tokens');
  return { useTheme: () => ({ colors: lightColors }) };
});

const campaign = {
  id: 'partner',
  advertiser: 'Partner',
  title: 'Your ride home',
  cta: 'Book a ride',
  url: 'https://partner.example/book',
  imageUrl: 'https://partner.example/banner.jpg',
};
let root: ReactTestRenderer | null = null;
beforeEach(() => {
  vi.clearAllMocks();
  runtime.reduced = false;
  runtime.open.mockResolvedValue(undefined);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', runtime.fetch);
  vi.stubEnv('EXPO_PUBLIC_DWD_ADS_URL', '');
});
afterEach(async () => {
  await act(() => root?.unmount());
  root = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function mount() {
  await act(() => {
    root = create(createElement(TonightBanners), {
      createNodeMock: (element) =>
        String(element.type) === 'ScrollView' ? { scrollTo: runtime.scroll } : null,
    });
  });
  await act(() => {
    const view = native('View').find((node) => node.props['onLayout']);
    if (view)
      (view.props['onLayout'] as (event: unknown) => void)({
        nativeEvent: { layout: { width: 360 } },
      });
  });
}
function banners() {
  return native('Action');
}
function native(type: string) {
  return root?.root.findAll((node) => String(node.type) === type) ?? [];
}
function one(type: string) {
  const node = native(type)[0];
  if (!node) throw new Error(`Missing ${type}`);
  return node;
}

describe('Tonight banner placement', () => {
  it('uses house banners without making a request and opens the corresponding screen', async () => {
    await mount();
    expect(runtime.fetch).not.toHaveBeenCalled();
    expect(banners()).toHaveLength(3);
    await act(() => (banners()[1]?.props['onPress'] as () => void)());
    expect(runtime.push).toHaveBeenCalledWith('/join');
    expect(runtime.open).not.toHaveBeenCalled();
  });

  it('loads a sponsor, opens its URL, and retains the offer if the artwork fails', async () => {
    vi.stubEnv('EXPO_PUBLIC_DWD_ADS_URL', 'https://dwd.example/ads.json');
    runtime.fetch.mockResolvedValue({ ok: true, json: () => ({ ads: [campaign] }) });
    await mount();
    expect(banners()).toHaveLength(1);
    expect(banners()[0]?.props['label']).toContain('Sponsored by Partner');
    await act(() => (one('Image').props['onError'] as () => void)());
    expect(native('Image')).toHaveLength(0);
    await act(() => (banners()[0]?.props['onPress'] as () => void)());
    expect(runtime.open).toHaveBeenCalledWith(campaign.url);
    expect(runtime.push).not.toHaveBeenCalled();
  });

  it('hides the placement when the publisher sends an empty feed', async () => {
    vi.stubEnv('EXPO_PUBLIC_DWD_ADS_URL', 'https://dwd.example/ads.json');
    runtime.fetch.mockResolvedValue({ ok: true, json: () => ({ ads: [] }) });
    await mount();
    expect(root?.toJSON()).toBeNull();
  });

  it('keeps house banners and cancels a delivery request after six seconds', async () => {
    vi.useFakeTimers();
    vi.stubEnv('EXPO_PUBLIC_DWD_ADS_URL', 'https://dwd.example/ads.json');
    runtime.fetch.mockImplementation(() => new Promise(() => undefined));
    await mount();
    const options = runtime.fetch.mock.calls[0]?.[1] as { signal: AbortSignal };
    await act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(options.signal.aborted).toBe(true);
    expect(banners()).toHaveLength(3);
  });

  it('does not let a cancelled request replace the placement', async () => {
    vi.stubEnv('EXPO_PUBLIC_DWD_ADS_URL', 'https://dwd.example/ads.json');
    let resolve: (value: unknown) => void = () => undefined;
    runtime.fetch.mockImplementation(
      () =>
        new Promise((complete) => {
          resolve = complete;
        }),
    );
    await mount();
    const options = runtime.fetch.mock.calls[0]?.[1] as { signal: AbortSignal };
    await act(() => root?.unmount());
    root = null;
    expect(options.signal.aborted).toBe(true);
    await act(() => resolve({ ok: true, json: () => ({ ads: [campaign] }) }));
  });

  it('supports pagination with reduced motion and updates the selected dot after a swipe', async () => {
    runtime.reduced = true;
    await mount();
    const dots = native('Pressable');
    await act(() => (dots[2]?.props['onPress'] as () => void)());
    expect(runtime.scroll).toHaveBeenLastCalledWith({ x: 688, animated: false });
    expect(dots[2]?.props['accessibilityState']).toEqual({ selected: true });
    await act(() => {
      (one('ScrollView').props['onMomentumScrollEnd'] as (event: unknown) => void)({
        nativeEvent: { contentOffset: { x: 344 } },
      });
    });
    expect(dots[1]?.props['accessibilityState']).toEqual({ selected: true });
  });

  it('shows a recoverable error when the destination cannot open', async () => {
    vi.stubEnv('EXPO_PUBLIC_DWD_ADS_URL', 'https://dwd.example/ads.json');
    runtime.fetch.mockResolvedValue({ ok: true, json: () => ({ ads: [campaign] }) });
    runtime.open.mockRejectedValue(new Error('No browser'));
    await mount();
    await act(() => (banners()[0]?.props['onPress'] as () => void)());
    expect(one('Notice').props['message']).toBe('Could not open this link. Try again.');
  });
});
