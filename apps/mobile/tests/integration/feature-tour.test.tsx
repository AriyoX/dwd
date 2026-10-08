/* eslint-disable @typescript-eslint/no-deprecated -- Verify native measurements without a device. */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { ScrollView, View } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeatureTour } from '@/components/feature-tour';
import { tourCardLayout, type TourBox, type TourTargetId } from '@/lib/feature-tour';

const runtime = vi.hoisted(() => ({ back: null as (() => boolean) | null }));
vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  ScrollView: 'ScrollView',
  useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
  BackHandler: {
    addEventListener: (_event: string, callback: () => boolean) => {
      runtime.back = callback;
      return {
        remove: () => {
          runtime.back = null;
        },
      };
    },
  },
}));
vi.mock('@/components/primary-button', () => ({ PrimaryButton: 'Button' }));
vi.mock('@/providers/theme-provider', async () => {
  const { lightColors, makeTypography } = await import('@/theme/tokens');
  return { useTheme: () => ({ colors: lightColors, typography: makeTypography(lightColors) }) };
});
type Measured = (x: number, y: number, width: number, height: number) => void;
let root: ReactTestRenderer | null = null;
const finish = vi.fn();
const go = vi.fn();
const offset = { current: 0 };
let targetBox: TourBox;
const measure = vi.fn((done: Measured) =>
  done(targetBox.x, targetBox.y - offset.current, targetBox.width, targetBox.height),
);
const targets = { current: {} as Partial<Record<TourTargetId, View | null>> };
const container = {
  current: { measureInWindow: (done: Measured) => done(10, 80, 390, 710) } as unknown as View,
};
const scrollTo = vi.fn(({ y }: { y: number }) => {
  offset.current = y;
});
const scroll = {
  current: {
    scrollTo,
    getNativeScrollRef: () => ({ measureInWindow: (done: Measured) => done(10, 110, 390, 650) }),
  } as unknown as ScrollView,
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  offset.current = 0;
  targetBox = { x: 32, y: 250, width: 346, height: 56 };
  targets.current = { start: { measureInWindow: measure } as unknown as View };
});
afterEach(async () => {
  await act(() => root?.unmount());
  root = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function mount(index = 0) {
  await act(() => {
    root = create(
      createElement(FeatureTour, {
        index,
        targets,
        container,
        scroll,
        offset,
        onGo: go,
        onFinish: finish,
      }),
    );
  });
}
async function tick(ms = 250) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
function spotlight() {
  return root?.root.findAllByProps({ testID: 'tour-spotlight' })[0];
}
async function press(label: string) {
  await act(() => {
    const button = root?.root.findByProps({ label });
    if (!button) throw new Error('Missing tour control');
    (button.props['onPress'] as () => void)();
  });
}
describe('native feature highlights', () => {
  it('subtracts the shared window origin and leaves an already visible control in place', async () => {
    await mount();
    expect(spotlight()).toBeUndefined();
    await tick();
    expect(spotlight()?.props['style']).toMatchObject({
      left: 17,
      top: 165,
      width: 356,
      height: 66,
    });
    expect(scrollTo).not.toHaveBeenCalled();
    expect(root?.root.findAll((node) => String(node.type) === 'Modal')).toHaveLength(0);
  });
  it('remeasures after scrolling an offscreen target into the actual viewport', async () => {
    targetBox.y = 900;
    await mount();
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ y: 778, animated: false });
    expect(spotlight()).toBeUndefined();
    await tick();
    expect(spotlight()?.props['style']).toMatchObject({ left: 17, top: 37, height: 66 });
  });
  it('tracks delayed layout changes instead of keeping a stale outline', async () => {
    await mount();
    await tick();
    targetBox.y += 70;
    targetBox.height = 90;
    await tick(50);
    expect(spotlight()).toBeUndefined();
    await tick(100);
    expect(spotlight()?.props['style']).toMatchObject({ top: 235, height: 100 });
  });
  it('does not invent a target for a missing or zero-size view and can recover', async () => {
    targets.current = {};
    await mount();
    await tick();
    expect(spotlight()).toBeUndefined();
    expect(root?.root.findByProps({ label: 'Next' }).props['disabled']).toBe(true);
    await tick(2500);
    expect(JSON.stringify(root?.toJSON())).toContain("This item isn't available");
    expect(root?.root.findByProps({ label: 'Next' }).props['disabled']).toBe(false);
    targets.current.start = { measureInWindow: measure } as unknown as View;
    targetBox.width = 0;
    await tick();
    expect(spotlight()).toBeUndefined();
    targetBox.width = 346;
    await tick();
    expect(spotlight()).toBeDefined();
  });
  it('ignores measurements delivered after a step has been removed', async () => {
    let deliver: Measured | undefined;
    targets.current.start = {
      measureInWindow: (done: Measured) => {
        deliver = done;
      },
    } as unknown as View;
    await mount();
    await act(() => root?.unmount());
    root = null;
    await act(() => deliver?.(32, 900, 346, 56));
    expect(scrollTo).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps tour controls reachable when a target fills the viewport', async () => {
    targetBox.height = 700;
    await mount();
    await tick(350);
    expect(spotlight()).toBeUndefined();
    expect(root?.root.findByProps({ testID: 'tour-card' }).props['style']).toMatchObject({
      top: 38,
      maxHeight: 634,
    });
    expect(root?.root.findByProps({ label: 'Next' }).props['disabled']).toBe(false);
    await press('Skip tour');
    expect(finish).toHaveBeenCalledOnce();
  });
  it('supports immediate skip, Next, hardware Back and Done', async () => {
    await mount();
    await press('Skip tour');
    expect(finish).toHaveBeenCalledOnce();
    await tick();
    await press('Next');
    expect(go).toHaveBeenLastCalledWith(1);
    await act(() => root?.unmount());
    targets.current.settings = targets.current.start ?? null;
    await mount(5);
    await tick();
    await act(() => {
      expect(runtime.back?.()).toBe(true);
    });
    expect(go).toHaveBeenLastCalledWith(4);
    await press('Done');
    expect(finish).toHaveBeenCalledTimes(2);
  });
  it('keeps a scrollable card inside the viewport and off the target at large text sizes', () => {
    const viewport = { x: 0, y: 30, width: 390, height: 500 };
    for (const box of [
      { x: 17, y: 50, width: 356, height: 100 },
      { x: 17, y: 400, width: 356, height: 110 },
    ]) {
      const card = tourCardLayout(box, viewport, 650);
      expect(card.top).toBeGreaterThanOrEqual(viewport.y);
      expect(card.top + card.maxHeight).toBeLessThanOrEqual(viewport.y + viewport.height);
      expect(card.maxHeight).toBeGreaterThan(100);
      expect(card.top >= box.y + box.height || card.top + card.maxHeight <= box.y).toBe(true);
    }
  });
});
