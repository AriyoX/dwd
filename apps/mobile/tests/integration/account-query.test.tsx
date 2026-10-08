/* eslint-disable @typescript-eslint/no-deprecated -- Verify tab focus and query timing without a device. */
import { useEffect, type EffectCallback } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAccountQuery } from '@/hooks/use-account-query';
import { invalidateAccountQuery } from '@/lib/account-query-state';

const runtime = vi.hoisted(() => ({
  focused: true,
  online: true,
  owner: 'account-one',
  token: 'token-one',
  foreground: new Set<(state: string) => void>(),
  client: {},
}));
vi.mock('react-native', () => ({
  AppState: {
    addEventListener: (_event: string, fn: (state: string) => void) => {
      runtime.foreground.add(fn);
      return { remove: () => runtime.foreground.delete(fn) };
    },
  },
}));
vi.mock('expo-router', () => ({
  useFocusEffect: (callback: EffectCallback) => {
    const focused = runtime.focused;
    useEffect(() => (focused ? callback() : undefined), [callback, focused]);
  },
}));
vi.mock('@/providers/connectivity-provider', () => ({
  useConnectivity: () => ({ online: runtime.online }),
}));
vi.mock('@/providers/supabase-provider', () => ({
  useSupabase: () => ({
    client: runtime.client,
    session: runtime.owner ? { user: { id: runtime.owner }, access_token: runtime.token } : null,
    status: runtime.owner ? 'signed-in' : 'signed-out',
  }),
}));

const load = vi.fn<() => Promise<string[]>>();
let query: ReturnType<typeof useAccountQuery<string[]>>;
let root: ReactTestRenderer | null = null;
let scope = 'finished-nights:0';
let staleTime = 60_000;
function Probe() {
  const value = useAccountQuery(() => load(), scope, true, false, undefined, staleTime);
  useEffect(() => {
    query = value;
  });
  return null;
}
async function update(action: () => void | Promise<void>) {
  await act(async () => {
    await action();
  });
}
async function render() {
  await update(() => {
    if (root) root.update(<Probe />);
    else root = create(<Probe />);
  });
}
async function focus(focused: boolean) {
  runtime.focused = focused;
  await render();
}
async function foreground() {
  await update(() => {
    for (const fn of runtime.foreground) fn('active');
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  load.mockReset().mockResolvedValue(['saved night']);
  runtime.focused = true;
  runtime.online = true;
  runtime.owner = 'account-one';
  runtime.token = 'token-one';
  scope = 'finished-nights:0';
  staleTime = 60_000;
});
afterEach(async () => {
  await update(() => root?.unmount());
  root = null;
  runtime.foreground.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('reuses a recent read on tab revisits, foreground, and token renewal', async () => {
  await render();
  await focus(false);
  await focus(true);
  await foreground();
  runtime.token = 'renewed-token';
  await render();
  expect(load).toHaveBeenCalledOnce();
  expect(query.data).toEqual(['saved night']);
  expect(query.loading).toBe(false);
});

it('quietly refreshes stale data and coalesces automatic events while the read is pending', async () => {
  await render();
  await focus(false);
  await update(async () => {
    await vi.advanceTimersByTimeAsync(60_001);
  });
  let finish!: (value: string[]) => void;
  load.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await focus(true);
  expect(query.data).toEqual(['saved night']);
  expect(query.loading).toBe(true);
  expect(query.refreshing).toBe(false);
  await foreground();
  await foreground();
  expect(load).toHaveBeenCalledTimes(2);
  await update(() => finish(['updated night']));
  expect(query.data).toEqual(['updated night']);
  expect(query.loading).toBe(false);
});

it('always honors a manual pull even when data is fresh', async () => {
  await render();
  let finish!: (value: string[]) => void;
  load.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  let read!: Promise<void>;
  await update(() => {
    read = query.refresh(true);
  });
  expect(query.refreshing).toBe(true);
  expect(load).toHaveBeenCalledTimes(2);
  await update(async () => {
    finish(['pulled night']);
    await read;
  });
  expect(query.data).toEqual(['pulled night']);
  expect(query.refreshing).toBe(false);
});

it('invalidates all history pages after a change, only for the affected account', async () => {
  scope = 'finished-nights:1';
  await render();
  await focus(false);
  invalidateAccountQuery('account-two', 'finished-nights');
  invalidateAccountQuery('account-one', 'profile-name');
  await focus(true);
  expect(load).toHaveBeenCalledOnce();
  await focus(false);
  invalidateAccountQuery('account-one', 'finished-nights');
  load.mockResolvedValue(['just ended night']);
  await focus(true);
  expect(load).toHaveBeenCalledTimes(2);
  expect(query.data).toEqual(['just ended night']);
});

it('refreshes the account name immediately after a profile save', async () => {
  scope = 'profile-name';
  staleTime = 5 * 60_000;
  load.mockResolvedValue(['Alex']);
  await render();
  await focus(false);
  invalidateAccountQuery('account-one', 'profile-name');
  load.mockResolvedValue(['Ariyo']);
  await focus(true);
  expect(query.data).toEqual(['Ariyo']);
  expect(load).toHaveBeenCalledTimes(2);
});

it('loads a different page immediately and ignores late results from the previous account', async () => {
  await render();
  scope = 'finished-nights:1';
  let oldRead!: (value: string[]) => void;
  load.mockReturnValueOnce(
    new Promise((resolve) => {
      oldRead = resolve;
    }),
  );
  await render();
  expect(query.data).toBeNull();
  let newRead!: (value: string[]) => void;
  load.mockReturnValueOnce(
    new Promise((resolve) => {
      newRead = resolve;
    }),
  );
  runtime.owner = 'account-two';
  await render();
  expect(query.data).toBeNull();
  await update(() => oldRead(['private old night']));
  expect(query.data).toBeNull();
  await update(() => newRead(['new account night']));
  expect(query.data).toEqual(['new account night']);
  expect(localStorage.getItem('dwd.mobile.cache.v1:account-two:finished-nights:1')).not.toContain(
    'private',
  );
});

it('does not treat offline fallback as fresh and retries when connectivity returns', async () => {
  await render();
  await update(async () => {
    await vi.advanceTimersByTimeAsync(60_001);
  });
  runtime.online = false;
  await render();
  expect(query.cached).toBe(true);
  expect(query.data).toEqual(['saved night']);
  load.mockResolvedValue(['online night']);
  runtime.online = true;
  await render();
  expect(query.cached).toBe(false);
  expect(query.issue).toBeNull();
  expect(query.data).toEqual(['online night']);
});

it('keeps live queries refreshing on every visit by default', async () => {
  staleTime = 0;
  await render();
  await focus(false);
  await focus(true);
  expect(load).toHaveBeenCalledTimes(2);
});
