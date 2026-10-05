/* eslint-disable @typescript-eslint/no-deprecated -- Native provider verification without a physical device. */
import { act, createElement, useEffect } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dwd/core';
import type { Notification, NotificationResponse, NotificationBehavior } from 'expo-notifications';
import { NotificationsProvider, useNotifications } from './providers/notifications-provider';
import {
  INSTALLATION_KEY,
  pushPreferenceKey,
  pushRegistrationKey,
} from './lib/native-notifications';

const runtime = vi.hoisted(() => ({
  auth: {
    client: {} as SupabaseClient<Database>,
    session: null as Session | null,
    access: 'ready',
  },
  router: { push: vi.fn() },
  permission: { granted: true, canAskAgain: true },
  foreground: new Set<(state: string) => void>(),
  taps: new Set<(response: NotificationResponse) => void>(),
  handler: null as null | ((notification: Notification) => Promise<NotificationBehavior>),
  last: null as NotificationResponse | null,
  request: vi.fn(),
  token: vi.fn(),
  register: vi.fn(),
  remove: vi.fn(),
  events: vi.fn(),
  acknowledge: vi.fn(),
}));
vi.mock('@/providers/supabase-provider', () => ({ useSupabase: () => runtime.auth }));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    addEventListener: (_event: string, fn: (state: string) => void) => {
      runtime.foreground.add(fn);
      return { remove: () => runtime.foreground.delete(fn) };
    },
  },
}));
vi.mock('expo-router', () => ({ useRouter: () => runtime.router }));
vi.mock('expo-constants', () => ({
  default: { easConfig: { projectId: '00000000-0000-4000-8000-000000000080' } },
}));
vi.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000010' }));
vi.mock('@dwd/data', () => ({
  registerNativePush: runtime.register,
  removeNativePush: runtime.remove,
  getMyNotificationEvents: runtime.events,
  acknowledgeNotification: runtime.acknowledge,
}));
vi.mock('expo-notifications', () => ({
  getPermissionsAsync: () => Promise.resolve(runtime.permission),
  requestPermissionsAsync: runtime.request,
  getExpoPushTokenAsync: runtime.token,
  dismissAllNotificationsAsync: () => Promise.resolve(),
  setNotificationHandler: ({
    handleNotification,
  }: {
    handleNotification: typeof runtime.handler;
  }) => {
    runtime.handler = handleNotification;
  },
  getLastNotificationResponse: () => runtime.last,
  clearLastNotificationResponse: () => {
    runtime.last = null;
  },
  addNotificationResponseReceivedListener: (fn: (response: NotificationResponse) => void) => {
    runtime.taps.add(fn);
    return { remove: () => runtime.taps.delete(fn) };
  },
  addNotificationReceivedListener: () => ({ remove: vi.fn() }),
  addPushTokenListener: () => ({ remove: vi.fn() }),
}));
const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const eventId = '00000000-0000-4000-8000-000000000030';
const nightId = '00000000-0000-4000-8000-000000000040';
let root: ReactTestRenderer | undefined;
let state: ReturnType<typeof useNotifications>;
function Probe() {
  const value = useNotifications();
  useEffect(() => {
    state = value;
  }, [value]);
  return null;
}
async function update(action: () => void | Promise<void>) {
  await act(async () => {
    await action();
  });
}
async function mount() {
  await update(() => {
    root = create(createElement(NotificationsProvider, null, createElement(Probe)));
  });
}
function session(id: string): Session {
  return { user: { id }, access_token: `token-${id}` } as Session;
}
function response(recipient = owner): NotificationResponse {
  return {
    actionIdentifier: 'default',
    notification: {
      date: 0,
      request: {
        identifier: eventId,
        content: { data: { eventId, recipientUserId: recipient, nightId } },
      },
    },
  } as unknown as NotificationResponse;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  });
  runtime.auth = {
    client: {} as SupabaseClient<Database>,
    session: session(owner),
    access: 'ready',
  };
  runtime.permission = { granted: true, canAskAgain: true };
  runtime.last = null;
  runtime.request.mockResolvedValue({ granted: true, canAskAgain: true });
  runtime.token.mockResolvedValue({ data: 'ExpoPushToken[fixture]' });
  runtime.register.mockResolvedValue(undefined);
  runtime.remove.mockResolvedValue(undefined);
  runtime.events.mockResolvedValue([{ id: eventId, nightId }]);
  runtime.acknowledge.mockResolvedValue(undefined);
});
afterEach(async () => {
  if (root) await update(() => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});
describe('native permission and token lifecycle', () => {
  it('does not prompt or register until enabled, then registers and unregisters this installation', async () => {
    await mount();
    expect(runtime.request).not.toHaveBeenCalled();
    expect(runtime.register).not.toHaveBeenCalled();
    await update(() => state.enable());
    expect(state.state).toBe('ready');
    expect(runtime.register).toHaveBeenCalledWith(
      expect.anything(),
      globalThis.localStorage.getItem(INSTALLATION_KEY),
      'ExpoPushToken[fixture]',
      'ios',
    );
    await update(() => state.disable());
    expect(state.state).toBe('off');
    expect(runtime.remove).toHaveBeenCalledOnce();
    expect(globalThis.localStorage.getItem(pushPreferenceKey(owner))).toBe('disabled');
  });
  it('requests permission only through the enable action and leaves the inbox usable on denial', async () => {
    runtime.permission = { granted: false, canAskAgain: true };
    runtime.request.mockResolvedValue({ granted: false, canAskAgain: false });
    await mount();
    await update(() => state.enable());
    expect(runtime.request).toHaveBeenCalledOnce();
    expect(state.state).toBe('denied');
    expect(runtime.token).not.toHaveBeenCalled();
  });
  it('cannot register a token obtained after switching accounts', async () => {
    let resolve: ((value: { data: string }) => void) | undefined;
    runtime.token.mockImplementation(
      () =>
        new Promise((value) => {
          resolve = value;
        }),
    );
    await mount();
    let enable: Promise<void> | undefined;
    await update(() => {
      enable = state.enable();
    });
    runtime.auth = { ...runtime.auth, session: session(other) };
    await update(() =>
      root?.update(createElement(NotificationsProvider, null, createElement(Probe))),
    );
    await update(async () => {
      resolve?.({ data: 'ExpoPushToken[old]' });
      await enable;
    });
    expect(runtime.register).not.toHaveBeenCalled();
    expect(state.state).toBe('off');
  });
  it('finishes explicit opt-in after permission is granted in Settings without prompting again', async () => {
    runtime.permission = { granted: false, canAskAgain: true };
    runtime.request.mockResolvedValue({ granted: false, canAskAgain: false });
    await mount();
    await update(() => state.enable());
    expect(state.state).toBe('denied');
    expect(globalThis.localStorage.getItem(pushPreferenceKey(owner))).toBe('enabled');
    runtime.permission = { granted: true, canAskAgain: false };
    await update(() => {
      for (const listener of runtime.foreground) listener('active');
    });
    expect(state.state).toBe('ready');
    expect(runtime.request).toHaveBeenCalledOnce();
    expect(runtime.register).toHaveBeenCalledOnce();
  });
  it('does not register after withdrawing opt-in while OS permission is denied', async () => {
    runtime.permission = { granted: false, canAskAgain: false };
    await mount();
    await update(() => state.enable());
    await update(() => state.disable());
    runtime.permission = { granted: true, canAskAgain: false };
    await update(() => {
      for (const listener of runtime.foreground) listener('active');
    });
    expect(state.state).toBe('off');
    expect(runtime.register).not.toHaveBeenCalled();
  });
  it('reconciles permission revocation when returning to the foreground', async () => {
    globalThis.localStorage.setItem(pushPreferenceKey(owner), 'enabled');
    await mount();
    expect(state.state).toBe('ready');
    runtime.permission = { granted: false, canAskAgain: false };
    await update(() => {
      for (const listener of runtime.foreground) listener('active');
    });
    expect(state.state).toBe('denied');
    expect(runtime.remove).toHaveBeenCalledOnce();
  });
  it('reports registration failures and allows retry without losing the enable preference', async () => {
    runtime.register.mockRejectedValueOnce(new Error('offline'));
    await mount();
    await update(() => state.enable());
    expect(state.state).toBe('unavailable');
    expect(state.issue).toMatch('Retry');
    await update(() => state.enable());
    expect(state.state).toBe('ready');
  });
  it('keeps a failed disable visible and retries unregistering on foreground return', async () => {
    await mount();
    await update(() => state.enable());
    runtime.remove.mockRejectedValueOnce(new Error('offline'));
    runtime.remove.mockRejectedValueOnce(new Error('still offline'));
    await update(() => state.disable());
    expect(state.state).toBe('unavailable');
    expect(globalThis.localStorage.getItem(pushRegistrationKey(owner))).not.toBeNull();
    await update(() => {
      for (const listener of runtime.foreground) listener('active');
    });
    expect(state.state).toBe('unavailable');
    expect(state.issue).toMatch('turn off');
    await update(() => {
      for (const listener of runtime.foreground) listener('active');
    });
    expect(state.state).toBe('off');
    expect(runtime.remove).toHaveBeenCalledTimes(3);
    expect(globalThis.localStorage.getItem(pushRegistrationKey(owner))).toBeNull();
  });
  it('verifies the account before opening a cold-start notification and deduplicates taps', async () => {
    runtime.last = response();
    await mount();
    expect(runtime.router.push).toHaveBeenCalledWith(`/night/${nightId}`);
    await update(() => {
      for (const listener of runtime.taps) listener(response());
    });
    expect(runtime.router.push).toHaveBeenCalledOnce();
    expect(runtime.acknowledge).toHaveBeenCalledWith(expect.anything(), eventId);
  });
  it('keeps a cold-start tap until account restoration is ready', async () => {
    runtime.auth = { ...runtime.auth, session: null, access: 'loading' };
    runtime.last = response();
    await mount();
    expect(runtime.router.push).not.toHaveBeenCalled();
    expect(runtime.last).not.toBeNull();
    runtime.auth = { ...runtime.auth, session: session(owner), access: 'ready' };
    await update(() =>
      root?.update(createElement(NotificationsProvider, null, createElement(Probe))),
    );
    expect(runtime.router.push).toHaveBeenCalledWith(`/night/${nightId}`);
    expect(runtime.last).toBeNull();
  });
  it('suppresses another account’s foreground notification and never follows its night link', async () => {
    runtime.last = response(other);
    await mount();
    expect(runtime.router.push).not.toHaveBeenCalled();
    const handler = runtime.handler;
    if (!handler) throw new Error('Missing handler');
    expect(await handler(response(other).notification)).toMatchObject({
      shouldShowBanner: false,
      shouldShowList: false,
    });
  });
  it('deactivation does not require a registration RPC when this device never enabled push', async () => {
    await mount();
    await update(() => state.deactivate());
    expect(runtime.remove).not.toHaveBeenCalled();
    expect(globalThis.localStorage.getItem(pushRegistrationKey(owner))).toBeNull();
  });
  it('reports device-storage failures without starting a permission request', async () => {
    vi.spyOn(globalThis.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('Device storage unavailable');
    });
    await mount();
    expect(state.state).toBe('unavailable');
    expect(state.busy).toBe(false);
    expect(state.issue).toMatch('Retry');
    expect(runtime.request).not.toHaveBeenCalled();
  });
});
