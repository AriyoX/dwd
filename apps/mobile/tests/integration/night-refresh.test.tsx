/* eslint-disable @typescript-eslint/no-deprecated -- Verify subscription and refresh timing without an emulator. */
import { useEffect, type EffectCallback } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useNight } from '@/hooks/use-night';

const runtime = vi.hoisted(() => ({
  refresh: vi.fn(),
  retry: vi.fn(),
  removeChannel: vi.fn(),
  subscribe: null as null | ((state: string) => void),
}));
vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove: vi.fn() }) },
}));
vi.mock('expo-router', () => ({
  useFocusEffect: (callback: EffectCallback) => useEffect(callback, [callback]),
}));
vi.mock('@/hooks/use-account-query', () => ({
  useAccountQuery: () => ({ data: null, refresh: runtime.refresh }),
}));
vi.mock('@/providers/offline-provider', () => ({
  useOffline: () => ({ activityVersion: 0, outbox: null, retry: runtime.retry }),
}));
vi.mock('@/providers/supabase-provider', () => {
  const channel = {
    on: () => channel,
    subscribe: (callback: (state: string) => void) => {
      runtime.subscribe = callback;
    },
  };
  const client = {
    channel: () => channel,
    realtime: { setAuth: () => Promise.resolve() },
    removeChannel: runtime.removeChannel,
  };
  return { useSupabase: () => ({ client, session: { access_token: 'test-token' } }) };
});

let root: ReactTestRenderer | null = null;
function Probe() {
  useNight('night');
  return null;
}
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

it('silently reconciles remote undo even when Realtime is connected, and cleans up on blur', async () => {
  await act(() => {
    root = create(<Probe />);
  });
  await act(async () => {
    runtime.subscribe?.('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(150);
  });
  expect(runtime.refresh).toHaveBeenCalledExactlyOnceWith();
  runtime.refresh.mockClear();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000);
  });
  // No `true` argument: only an explicit pull may display refresh progress.
  expect(runtime.refresh).toHaveBeenCalledExactlyOnceWith();
  await act(() => root?.unmount());
  root = null;
  expect(runtime.removeChannel).toHaveBeenCalledOnce();
  runtime.refresh.mockClear();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(runtime.refresh).not.toHaveBeenCalled();
});
