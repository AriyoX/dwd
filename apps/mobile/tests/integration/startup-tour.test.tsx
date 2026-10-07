/* eslint-disable @typescript-eslint/no-deprecated -- Verify startup navigation without a device. */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { TourNavigation } from '@/components/tour-navigation';
import { rememberTourSeen, tourSeenKey } from '@/lib/practice-tour';

const runtime = vi.hoisted(() => ({
  session: null as Session | null,
  access: 'ready',
  pathname: '/',
  online: true as boolean | null,
  push: vi.fn(),
  updateUser: vi.fn(),
  foreground: new Set<(value: string) => void>(),
}));
vi.mock('@/providers/supabase-provider', () => ({
  useSupabase: () => ({
    session: runtime.session,
    access: runtime.access,
    client: { auth: { updateUser: runtime.updateUser } },
  }),
}));
vi.mock('@/providers/connectivity-provider', () => ({
  useConnectivity: () => ({ online: runtime.online }),
}));
vi.mock('react-native', () => ({
  AppState: {
    addEventListener: (_event: string, callback: (value: string) => void) => {
      runtime.foreground.add(callback);
      return { remove: () => runtime.foreground.delete(callback) };
    },
  },
}));
vi.mock('expo-router', () => ({
  usePathname: () => runtime.pathname,
  useRootNavigationState: () => ({ key: 'root' }),
  useRouter: () => ({ push: runtime.push }),
}));
const owner = '00000000-0000-4000-8000-000000000001';
let root: ReactTestRenderer | null = null;
const session = (id = owner, seen = false): Session => ({
  user: {
    id,
    user_metadata: { tour_seen: seen },
    app_metadata: {},
    aud: 'authenticated',
    created_at: '2026-10-06T00:00:00Z',
  },
  access_token: 'fixture',
  refresh_token: 'fixture',
  expires_in: 3600,
  token_type: 'bearer',
});
async function render() {
  await act(() => {
    if (root) root.update(createElement(TourNavigation));
    else root = create(createElement(TourNavigation));
  });
}
async function timers() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  });
  runtime.session = session();
  runtime.access = 'ready';
  runtime.pathname = '/';
  runtime.online = true;
  runtime.updateUser.mockResolvedValue({ data: { user: runtime.session.user }, error: null });
});
afterEach(async () => {
  await act(() => root?.unmount());
  root = null;
  runtime.foreground.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('automatic startup tour', () => {
  it('opens once for a new user, records display before navigation, and syncs the web preference', async () => {
    await render();
    await timers();
    expect(runtime.push).toHaveBeenCalledExactlyOnceWith('/tour');
    expect(localStorage.getItem(tourSeenKey(owner))).toBe('true');
    runtime.pathname = '/tour';
    await render();
    expect(runtime.updateUser).toHaveBeenCalledWith({ data: { tour_seen: true } });
    runtime.pathname = '/';
    await render();
    await timers();
    expect(runtime.push).toHaveBeenCalledOnce();
  });
  it('does not repeat after dismissal and a fresh app launch', async () => {
    await render();
    await timers();
    await act(() => root?.unmount());
    root = null;
    runtime.push.mockClear();
    await render();
    await timers();
    expect(runtime.push).not.toHaveBeenCalled();
  });
  it('honors both the saved local preference and completion on the web', async () => {
    rememberTourSeen(localStorage, owner);
    await render();
    await timers();
    expect(runtime.push).not.toHaveBeenCalled();
    runtime.session = session('00000000-0000-4000-8000-000000000002', true);
    await render();
    await timers();
    expect(runtime.push).not.toHaveBeenCalled();
  });
  it('waits for onboarding and invite navigation to finish', async () => {
    runtime.access = 'profile';
    await render();
    await timers();
    expect(runtime.push).not.toHaveBeenCalled();
    runtime.access = 'ready';
    runtime.pathname = '/join';
    await render();
    await timers();
    expect(runtime.push).not.toHaveBeenCalled();
    runtime.pathname = '/';
    await render();
    await timers();
    expect(runtime.push).toHaveBeenCalledExactlyOnceWith('/tour');
  });
  it('shows the tour offline and syncs its preference after reconnection', async () => {
    runtime.online = false;
    await render();
    await timers();
    runtime.pathname = '/tour';
    await render();
    expect(runtime.updateUser).not.toHaveBeenCalled();
    runtime.online = true;
    await render();
    expect(runtime.updateUser).toHaveBeenCalledExactlyOnceWith({ data: { tour_seen: true } });
    expect(runtime.push).toHaveBeenCalledOnce();
  });
});
