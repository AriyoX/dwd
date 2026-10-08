/* eslint-disable @typescript-eslint/no-deprecated -- Render native component trees without requiring a device or a browser DOM. */
import { act, createElement, useEffect } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dwd/core';
import { SupabaseProvider, useSupabase } from '@/providers/supabase-provider';
import { OfflineProvider, useOffline } from '@/providers/offline-provider';
import { useAccountQuery } from '@/hooks/use-account-query';
import { NightActivity } from '@/components/night-activity';
import { PrimaryButton } from '@/components/primary-button';
import { readOfflineSession } from '@/lib/offline-session';
import { NativePendingLogStore, type NativePendingLog } from '@/lib/offline-logging';
import { writeOfflineCache } from '@/lib/offline-cache';

const runtime = vi.hoisted(() => ({
  client: null as SupabaseClient<Database> | null,
  foreground: new Set<(state: string) => void>(),
  confirm: vi.fn(),
  online: null as boolean | null,
}));
vi.mock('@/providers/connectivity-provider', () => ({
  useConnectivity: () => ({ online: runtime.online }),
}));
vi.mock('@/components/dismissible-notice', () => ({ DismissibleNotice: 'Text' }));
vi.mock('react-native', () => ({
  Text: 'Text',
  View: 'View',
  Pressable: 'Pressable',
  ActivityIndicator: 'ActivityIndicator',
  ScrollView: 'ScrollView',
  KeyboardAvoidingView: 'View',
  Platform: { OS: 'ios' },
  AppState: {
    currentState: 'active',
    addEventListener: (_event: string, fn: (state: string) => void) => {
      runtime.foreground.add(fn);
      return { remove: () => runtime.foreground.delete(fn) };
    },
  },
}));
vi.mock('expo-router', () => ({
  useFocusEffect: (callback: () => () => void) => useEffect(callback, [callback]),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('react-native-reanimated', () => ({
  default: { View: 'View' },
  useReducedMotion: () => true,
  cubicBezier: vi.fn(),
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'View' }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('@/providers/theme-provider', async () => {
  const { lightColors, makeTypography } = await import('@/theme/tokens');
  return { useTheme: () => ({ colors: lightColors, typography: makeTypography(lightColors) }) };
});
vi.mock('@/lib/confirm', () => ({ confirmAction: runtime.confirm }));
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => runtime.client,
  restoreOfflineSession: (error: unknown) =>
    readOfflineSession(globalThis.localStorage, 'auth', error),
}));

const owner = '00000000-0000-4000-8000-000000000001';
const offlineError = {
  name: 'AuthRetryableFetchError',
  message: 'Network request failed',
  status: 0,
};
const expiredSession = {
  access_token: 'expired-token',
  refresh_token: 'refresh-token',
  expires_in: 3600,
  expires_at: 1,
  token_type: 'bearer',
  user: {
    id: owner,
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-10-03T18:00:00Z',
  },
} as Session;
const pending: NativePendingLog = {
  idempotencyKey: '00000000-0000-4000-8000-000000000010',
  actorUserId: owner,
  nightId: '00000000-0000-4000-8000-000000000003',
  nightMemberId: '00000000-0000-4000-8000-000000000002',
  memberDisplayName: 'Alex',
  kind: 'alcohol',
  customDrink: { label: 'Beer', category: 'beer', volumeMl: 330, abvPercent: 5 },
  consumedAt: '2026-10-04T18:00:00.000Z',
  createdLocallyAt: '2026-10-04T18:00:00.000Z',
  status: 'needs_confirmation',
  requiredWarnings: ['plan_exceeded'],
  retryCount: 0,
  acknowledgePlanExceeded: false,
  acknowledgeAfterEnd: false,
  attempted: false,
};
let root: ReactTestRenderer;
let auth: ReturnType<typeof useSupabase>;
let queue: ReturnType<typeof useOffline>;
let query: ReturnType<typeof useAccountQuery<string[]>>;
const load = vi.fn<(client: SupabaseClient<Database>) => Promise<string[]>>();
const onLoaded = vi.fn();
const authListeners = new Set<(event: AuthChangeEvent, session: Session | null) => void>();
function emit(event: AuthChangeEvent, session: Session | null) {
  for (const listener of authListeners) listener(event, session);
}
const getSession = vi.fn();
const profile = vi.fn();
function Probe() {
  const authValue = useSupabase();
  const queueValue = useOffline();
  // Deliberately inline: rerenders must not create another load/focus loop.
  const queryValue = useAccountQuery(
    (client) => load(client),
    'active-nights',
    true,
    false,
    onLoaded,
  );
  useEffect(() => {
    auth = authValue;
    queue = queueValue;
    query = queryValue;
  }, [authValue, queueValue, queryValue]);
  return createElement(NightActivity, { nightId: pending.nightId, timezone: 'UTC' });
}
function press(label: string) {
  const onPress = root.root.findByProps({ accessibilityLabel: label }).props[
    'onPress'
  ] as () => void;
  onPress();
}
async function update(action: () => void | Promise<void>) {
  await act(async () => {
    await action();
  });
}
async function mount() {
  await update(() => {
    root = create(
      createElement(
        SupabaseProvider,
        null,
        createElement(OfflineProvider, null, createElement(Probe)),
      ),
    );
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  runtime.online = null;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  localStorage.setItem('auth', JSON.stringify(expiredSession));
  writeOfflineCache(localStorage, owner, 'profile-complete', true);
  writeOfflineCache(localStorage, owner, 'active-nights', ['cached night']);
  new NativePendingLogStore(localStorage, owner).save(pending);
  getSession.mockResolvedValue({ data: { session: null }, error: offlineError });
  profile.mockResolvedValue({ data: null, error: offlineError });
  load.mockRejectedValue(new Error('Network request failed'));
  runtime.confirm.mockResolvedValue(true);
  runtime.client = {
    auth: {
      getSession,
      onAuthStateChange: (fn: (event: AuthChangeEvent, session: Session | null) => void) => {
        authListeners.add(fn);
        // Supabase emits null here when refresh fails, even with a session on disk.
        void Promise.resolve().then(() => fn('INITIAL_SESSION', null));
        return { data: { subscription: { unsubscribe: () => authListeners.delete(fn) } } };
      },
      startAutoRefresh: vi.fn(),
      stopAutoRefresh: vi.fn(),
    },
    from: () => ({
      select: () => ({ eq: () => ({ abortSignal: () => ({ maybeSingle: profile }) }) }),
    }),
  } as unknown as SupabaseClient<Database>;
});
afterEach(async () => {
  await update(() => root.unmount());
  authListeners.clear();
  runtime.foreground.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('native offline provider and screen integration', () => {
  it('uses saved entries while offline and retries the same entry when the connection returns', async () => {
    runtime.online = false;
    new NativePendingLogStore(localStorage, owner).update(pending.idempotencyKey, {
      status: 'pending',
    });
    const request = Object.assign(
      Promise.resolve({
        data: { status: 'temporarily_failed', message: 'Unavailable' },
        error: null,
      }),
      { setHeader: () => request, abortSignal: () => request },
    );
    const rpc = vi.fn(() => request);
    if (!runtime.client) throw new Error('Missing test client');
    runtime.client.rpc = rpc as unknown as SupabaseClient<Database>['rpc'];
    await mount();
    await update(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await queue.retry();
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(query.data).toEqual(['cached night']);
    runtime.online = true;
    await update(() =>
      root.update(
        createElement(
          SupabaseProvider,
          null,
          createElement(OfflineProvider, null, createElement(Probe)),
        ),
      ),
    );
    await update(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(queue.records[0]?.idempotencyKey).toBe(pending.idempotencyKey);
  });
  it('keeps a delayed read bound to its original account after an account switch', async () => {
    const authorization = vi.fn();
    const request = Object.assign(Promise.resolve({ data: [], error: null }), {
      setHeader: (name: string, value: string) => {
        authorization(name, value);
        return request;
      },
      abortSignal: () => request,
    });
    if (!runtime.client) throw new Error('Missing test client');
    runtime.client.rpc = vi.fn(() => request) as unknown as SupabaseClient<Database>['rpc'];
    await mount();
    const originalConnection = load.mock.calls.at(-1)?.[0];
    if (!originalConnection) throw new Error('Missing initial query');
    profile.mockResolvedValue({ data: { id: 'another-account' }, error: null });
    load.mockResolvedValue(['another account night']);
    await update(() =>
      emit('SIGNED_IN', {
        ...expiredSession,
        access_token: 'another-token',
        user: { ...expiredSession.user, id: '00000000-0000-4000-8000-000000000099' },
      }),
    );
    await originalConnection.rpc('get_active_nights');
    expect(authorization).toHaveBeenLastCalledWith('Authorization', 'Bearer expired-token');
    expect(query.data).toEqual(['another account night']);
    expect(localStorage.getItem(`dwd.mobile.cache.v1:${owner}:active-nights`)).toContain(
      'cached night',
    );
  });
  it('reopens cached activity and the original queue after an expired token cannot refresh offline', async () => {
    await mount();
    expect(auth.access).toBe('ready');
    expect(auth.session?.user.id).toBe(owner);
    expect(query.data).toEqual(['cached night']);
    expect(query.cached).toBe(true);
    expect(queue.outbox?.current()).toBe(true);
    expect(queue.records).toHaveLength(1);
  });

  it('does not restore local access after a server rejects the session', async () => {
    getSession.mockResolvedValue({
      data: { session: null },
      error: { status: 401, message: 'Invalid refresh token' },
    });
    await mount();
    expect(auth.session).toBeNull();
    expect(queue.outbox).toBeNull();
    expect(query.data).toBeNull();
  });

  it('does not restore an expired account whose profile has never been verified on this device', async () => {
    localStorage.removeItem(`dwd.mobile.cache.v1:${owner}:profile-complete`);
    await mount();
    expect(auth.access).toBe('profile');
    expect(queue.outbox).toBeNull();
  });

  it('invalidates local access immediately on sign-out and ignores a late restoration', async () => {
    let finish!: (value: unknown) => void;
    getSession.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await mount();
    await update(() => {
      localStorage.removeItem('auth');
      emit('SIGNED_OUT', null);
      finish({ data: { session: expiredSession }, error: null });
    });
    expect(auth.session).toBeNull();
    expect(queue.records).toEqual([]);
    expect(query.data).toBeNull();
  });

  it('recovers a storage read error even when the only entry is waiting for review', async () => {
    const original = localStorage.getItem.bind(localStorage);
    const read = vi.spyOn(localStorage, 'getItem');
    read.mockImplementation((key) => {
      if (key.includes('pending-logs')) throw new Error('Disk busy');
      return original(key);
    });
    await mount();
    expect(queue.issue).toBeTruthy();
    read.mockImplementation(original);
    await update(() => queue.retry());
    expect(queue.issue).toBeNull();
    expect(queue.records).toHaveLength(1);
  });

  it('falls back to saved activity when a request stalls, then recovers online on foreground', async () => {
    load.mockReturnValue(new Promise(() => undefined));
    await mount();
    await update(async () => {
      await vi.advanceTimersByTimeAsync(10_001);
    });
    expect(query.loading).toBe(false);
    expect(query.data).toEqual(['cached night']);
    load.mockResolvedValue(['fresh night']);
    await update(() => {
      for (const fn of runtime.foreground) fn('active');
    });
    expect(query.data).toEqual(['fresh night']);
    expect(query.cached).toBe(false);
    expect(query.issue).toBeNull();
  });

  it('only shows pull-to-refresh progress for an explicit pull and ignores older responses', async () => {
    load.mockResolvedValue(['initial night']);
    await mount();
    const initialCalls = load.mock.calls.length;
    await update(() => queue.retry());
    expect(load).toHaveBeenCalledTimes(initialCalls);
    let background!: (value: string[]) => void;
    load.mockReturnValueOnce(
      new Promise((resolve) => {
        background = resolve;
      }),
    );
    let silent!: Promise<void>;
    await update(() => {
      silent = query.refresh();
    });
    expect(query.loading).toBe(true);
    expect(query.refreshing).toBe(false);
    expect(query.data).toEqual(['initial night']);
    let pulled!: (value: string[]) => void;
    load.mockReturnValueOnce(
      new Promise((resolve) => {
        pulled = resolve;
      }),
    );
    let visible!: Promise<void>;
    await update(() => {
      visible = query.refresh(true);
    });
    expect(query.refreshing).toBe(true);
    await update(async () => {
      pulled(['latest night']);
      await visible;
    });
    await update(async () => {
      background(['older night']);
      await silent;
    });
    expect(query.data).toEqual(['latest night']);
    expect(query.refreshing).toBe(false);
    expect(onLoaded).toHaveBeenLastCalledWith(['latest night']);
    expect(onLoaded).not.toHaveBeenCalledWith(['older night']);
  });

  it('keeps pending entries compact and shows removal progress on the correct control', async () => {
    await mount();
    expect(root.root.findAllByType(PrimaryButton)).toHaveLength(0);
    const disclosure = root.root.findByProps({
      accessibilityLabel: 'View entries. 1 entries, 1 saved on phone',
    });
    expect(disclosure.props['accessibilityState'].expanded).toBe(false);
    await update(() => press('View entries. 1 entries, 1 saved on phone'));
    expect(
      root.root.findByProps({ accessibilityLabel: 'Hide entries. 1 entries, 1 saved on phone' })
        .props['accessibilityState'].expanded,
    ).toBe(true);
    let finish!: (value: boolean) => void;
    runtime.confirm.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await update(() => press('Remove entry'));
    expect(root.root.findByProps({ label: 'Remove entry' }).props['busy']).toBe(true);
    expect(root.root.findByProps({ label: 'Review entry' }).props['busy']).toBe(false);
    await update(() => {
      finish(true);
    });
    expect(queue.records).toEqual([]);
    expect(root.root.findAllByType(PrimaryButton)).toHaveLength(0);
    expect(
      root.root.findByProps({ accessibilityLabel: 'Hide entries. 0 entries' }).props[
        'accessibilityState'
      ].expanded,
    ).toBe(true);
  });
});
