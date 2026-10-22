/* eslint-disable @typescript-eslint/no-deprecated -- Exercise tour routing without a device. */
import { createElement, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeatureTourProvider, useFeatureTour } from '@/providers/feature-tour-provider';
import { FEATURE_TOUR_STEPS } from '@/lib/feature-tour';

const runtime = vi.hoisted(() => ({ pathname: '/tour', navigate: vi.fn(), dismissTo: vi.fn() }));
const router = { navigate: runtime.navigate, dismissTo: runtime.dismissTo };
vi.mock('expo-router', () => ({ useRouter: () => router, usePathname: () => runtime.pathname }));
let tour: ReturnType<typeof useFeatureTour>;
function Probe() {
  const value = useFeatureTour();
  useEffect(() => {
    tour = value;
  }, [value]);
  return null;
}
let root: ReactTestRenderer | null = null;
async function render() {
  await act(() => {
    const element = createElement(FeatureTourProvider, null, createElement(Probe));
    if (root) root.update(element);
    else root = create(element);
  });
}
async function arrive(pathname: string) {
  runtime.pathname = pathname;
  await render();
}
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  runtime.pathname = '/tour';
  await render();
});
afterEach(async () => {
  await act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});
describe('route-aware native tour', () => {
  it('visits the actual Entries, Notifications and Settings pages in both directions', async () => {
    await act(() => tour?.start());
    expect(runtime.dismissTo).toHaveBeenLastCalledWith('/');
    await arrive('/');
    const forward = FEATURE_TOUR_STEPS.map((_, index) => index).slice(1);
    const backward = [...forward].reverse().slice(1).concat(0);
    for (const index of [...forward, ...backward]) {
      await act(() => tour?.go(index));
      expect(tour?.index).toBe(index);
      const route = FEATURE_TOUR_STEPS[index]?.route;
      expect(runtime.navigate).toHaveBeenLastCalledWith(route);
      // Delayed route transitions do not cancel the pending step.
      await render();
      expect(tour?.index).toBe(index);
      await arrive(route ?? '/');
      expect(tour?.index).toBe(index);
    }
    await act(() => tour?.finish());
    expect(tour?.index).toBeNull();
    expect(runtime.dismissTo).toHaveBeenLastCalledWith('/');
  });
  it('returns a manual replay to Settings and does not reopen on later navigation', async () => {
    await act(() => tour?.start('/account'));
    await arrive('/');
    await act(() => tour?.go(FEATURE_TOUR_STEPS.findIndex((step) => step.id === 'notifications')));
    await arrive('/notifications');
    await act(() => tour?.finish());
    expect(runtime.dismissTo).toHaveBeenLastCalledWith('/account');
    await arrive('/account');
    await arrive('/');
    expect(tour?.index).toBeNull();
  });
  it('ends when the user leaves through a tab, header Back or a deep link', async () => {
    await act(() => tour?.start());
    await arrive('/');
    await arrive('/history');
    expect(tour?.index).toBeNull();
    await arrive('/');
    expect(tour?.index).toBeNull();
    expect(runtime.dismissTo).toHaveBeenCalledTimes(1);
  });
});
