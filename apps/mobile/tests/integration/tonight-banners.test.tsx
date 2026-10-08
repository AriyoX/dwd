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
  fontScale: 1,
  appState: (_state: string): void => {
    void _state;
  },
}));
vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Image: 'Image',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: runtime.fontScale }),
  Linking: { openURL: runtime.open },
  AppState: {
    currentState: 'active',
    addEventListener: (_event: string, callback: (state: string) => void) => {
      runtime.appState = callback;
      return { remove: vi.fn() };
    },
  },
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
  runtime.fontScale = 1;
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
  it.each([280, 360, 600])(
    'keeps mixed content the same size at a %s-point width',
    async (width) => {
      vi.stubEnv('EXPO_PUBLIC_DWD_ADS_URL', 'https://dwd.example/ads.json');
      const longTitle = 'Sunset at Kuri · Oct 10: Topia Twins, DJ Miracle & Chef Simples';
      runtime.fetch.mockResolvedValue({
        ok: true,
        json: () => ({
          ads: [
            campaign,
            { ...campaign, id: 'long', title: longTitle },
            { ...campaign, id: 'text-only', title: 'A short offer', imageUrl: undefined },
          ],
        }),
      });
      await mount();
      const placement = native('View').find((node) => node.props['onLayout']);
      await act(() =>
        (placement?.props['onLayout'] as (event: unknown) => void)({
          nativeEvent: { layout: { width } },
        }),
      );
      const height = one('ScrollView').props['style'].height as number;
      expect(height).toBeGreaterThan(0);
      for (const card of banners()) {
        expect(card.props['containerStyle']).toEqual({ width: width - 28, height });
        expect(card.props['style'].height).toBe(height);
      }
      expect(banners()[1]?.props['label']).toContain(longTitle);
      expect(
        native('Text').find((node) => node.props['children'] === longTitle)?.props['numberOfLines'],
      ).toBe(3);
      await act(() => (one('Image').props['onError'] as () => void)());
      expect(banners()[0]?.props['style'].height).toBe(height);
    },
  );

  it('grows every card together when accessibility text size increases', async () => {
    await mount();
    const initialHeight = one('ScrollView').props['style'].height as number;
    runtime.fontScale = 2;
    await act(() => root?.update(createElement(TonightBanners)));
    const height = one('ScrollView').props['style'].height as number;
    expect(height).toBeGreaterThan(initialHeight);
    expect(banners().every((card) => card.props['style'].height === height)).toBe(true);
    expect(native('Text').every((node) => node.props['allowFontScaling'] !== false)).toBe(true);
  });

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

  it('uses the deployed DWD feed by default when no mobile override is set', async () => {
    vi.stubEnv('EXPO_PUBLIC_DWD_ADS_URL', undefined);
    runtime.fetch.mockResolvedValue({ ok: true, json: () => ({ ads: [campaign] }) });
    await mount();
    expect(runtime.fetch.mock.calls[0]?.[0]).toBe('https://dwdug.vercel.app/tonight-ads.json');
    expect(banners()).toHaveLength(1);
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
    const dots = native('Pressable').filter((node) =>
      String(node.props['accessibilityLabel']).startsWith('Show banner'),
    );
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

  it('cycles all four campaigns, wraps, and stops in the background', async () => {
    vi.useFakeTimers();
    vi.stubEnv('EXPO_PUBLIC_DWD_ADS_URL', 'https://dwd.example/ads.json');
    runtime.fetch.mockResolvedValue({
      ok: true,
      json: () => ({
        ads: Array.from({ length: 4 }, (_, index) => ({ ...campaign, id: `partner-${index}` })),
      }),
    });
    await mount();
    runtime.scroll.mockClear();
    for (const next of [1, 2, 3, 0]) {
      await act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(runtime.scroll).toHaveBeenLastCalledWith({ x: next * 344, animated: next !== 0 });
    }
    expect(
      native('Pressable').some((node) =>
        String(node.props['accessibilityLabel']).includes('automatic banners'),
      ),
    ).toBe(false);
    runtime.scroll.mockClear();
    await act(() => runtime.appState('background'));
    await act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(runtime.scroll).not.toHaveBeenCalled();
    await act(() => runtime.appState('active'));
    await act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(runtime.scroll).toHaveBeenLastCalledWith({ x: 344, animated: true });
  });

  it('does not rotate automatically with reduced motion or during touch interaction', async () => {
    vi.useFakeTimers();
    runtime.reduced = true;
    await mount();
    runtime.scroll.mockClear();
    await act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(runtime.scroll).not.toHaveBeenCalled();
    runtime.reduced = false;
    await act(() => root?.update(createElement(TonightBanners)));
    const view = native('View').find((node) => node.props['onLayout']);
    await act(() => (view?.props['onTouchStart'] as () => void)());
    await act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(runtime.scroll).not.toHaveBeenCalled();
    await act(() => (view?.props['onTouchEnd'] as () => void)());
    await act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(runtime.scroll).toHaveBeenLastCalledWith({ x: 344, animated: true });
  });
});
