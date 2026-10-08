/* eslint-disable @typescript-eslint/no-deprecated -- Verify the read-only tour without a native runtime. */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { ScrollView, View } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FEATURE_TOUR_STEPS, FeatureTour, type TourTargetId } from '@/components/feature-tour';

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Modal: 'Modal',
  ScrollView: 'ScrollView',
  useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34 }),
}));
vi.mock('@/components/primary-button', () => ({ PrimaryButton: 'Button' }));
vi.mock('@/providers/theme-provider', async () => {
  const { lightColors, makeTypography } = await import('@/theme/tokens');
  return { useTheme: () => ({ colors: lightColors, typography: makeTypography(lightColors) }) };
});
let root: ReactTestRenderer | null = null;
const finish = vi.fn();
const scrollTo = vi.fn();
const measure = vi.fn((done: (x: number, y: number, width: number, height: number) => void) =>
  done(22, 80, 346, 56),
);
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});
afterEach(async () => {
  await act(() => root?.unmount());
  root = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function mount() {
  const targets = {
    current: Object.fromEntries(
      FEATURE_TOUR_STEPS.map((step) => [step.id, { measureInWindow: measure }]),
    ) as unknown as Record<TourTargetId, View>,
  };
  await act(() => {
    root = create(
      createElement(FeatureTour, {
        targets,
        scroll: { current: { scrollTo } as unknown as ScrollView },
        offset: { current: 0 },
        onFinish: finish,
      }),
    );
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250);
  });
}
async function press(label: string) {
  await act(() => {
    const button = root?.root.findByProps({ label });
    if (!button) throw new Error('Missing tour control');
    (button.props['onPress'] as () => void)();
  });
}
describe('native feature highlights', () => {
  it('measures real controls, scrolls to them and advances without any practice action', async () => {
    await mount();
    expect(measure).toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalledWith({ y: 9, animated: false });
    expect(
      root?.root.findByType('Modal' as unknown as React.ComponentType).props['transparent'],
    ).toBe(true);
    for (let step = 0; step < FEATURE_TOUR_STEPS.length - 1; step++) {
      expect(JSON.stringify(root?.toJSON())).toContain(FEATURE_TOUR_STEPS[step]?.title);
      await press('Next');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250);
      });
    }
    await press('Back');
    expect(JSON.stringify(root?.toJSON())).toContain('Look back');
    await press('Next');
    await press('Done');
    expect(finish).toHaveBeenCalledOnce();
  });
  it('can be skipped immediately, including before a target finishes measuring', async () => {
    await mount();
    await press('Skip tour');
    expect(finish).toHaveBeenCalledOnce();
  });
});
