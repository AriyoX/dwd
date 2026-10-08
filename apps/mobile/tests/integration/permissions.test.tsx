/* eslint-disable @typescript-eslint/no-deprecated, react-hooks/globals -- Observe the mounted permission coordinator without a device. */
import { useContext } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionsProvider } from '@/providers/permissions-provider';
import { PermissionContext } from '@/providers/permission-context';

const runtime = vi.hoisted(() => ({
  pushRead: vi.fn(),
  pushAsk: vi.fn(),
  locationRead: vi.fn(),
  locationAsk: vi.fn(),
  enable: vi.fn(),
  locate: vi.fn(),
  settings: vi.fn(),
  services: vi.fn(),
  state: 'active',
  listeners: new Set<(value: string) => void>(),
  session: null as null | { user: { id: string } },
  location: { enabled: false, permission: 'unknown', servicesEnabled: true, busy: false },
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Linking: { openSettings: runtime.settings },
  AppState: {
    get currentState() {
      return runtime.state;
    },
    addEventListener: (_: string, fn: (value: string) => void) => {
      runtime.listeners.add(fn);
      return { remove: () => runtime.listeners.delete(fn) };
    },
  },
}));
vi.mock('expo-location', () => ({
  getForegroundPermissionsAsync: runtime.locationRead,
  requestForegroundPermissionsAsync: runtime.locationAsk,
  hasServicesEnabledAsync: runtime.services,
}));
vi.mock('@/lib/notification-sdk', () => ({
  loadNotificationSdk: () =>
    Promise.resolve({
      getPermissionsAsync: runtime.pushRead,
      requestPermissionsAsync: runtime.pushAsk,
    }),
}));
vi.mock('@/providers/location-provider', () => ({
  useCountryLocation: () => ({ ...runtime.location, request: runtime.locate }),
}));
vi.mock('@/providers/notifications-provider', () => ({
  useNotifications: () => ({ state: 'ready', busy: false, enable: runtime.enable }),
}));
vi.mock('@/providers/supabase-provider', () => ({
  useSupabase: () => ({
    session: runtime.session,
    access: runtime.session ? 'ready' : 'signed-out',
  }),
}));
const undetermined = { granted: false, canAskAgain: true, status: 'undetermined' };
const granted = { granted: true, canAskAgain: true, status: 'granted' };
const denied = { granted: false, canAskAgain: false, status: 'denied' };
let root: ReactTestRenderer | null = null;
let value: NonNullable<React.ContextType<typeof PermissionContext>>;
function Probe() {
  const context = useContext(PermissionContext);
  if (!context) throw new Error('Missing permissions');
  value = context;
  return null;
}
async function render() {
  await act(() => {
    const element = (
      <PermissionsProvider>
        <Probe />
      </PermissionsProvider>
    );
    if (root) root.update(element);
    else root = create(element);
  });
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
  });
  runtime.session = null;
  runtime.state = 'active';
  runtime.pushRead.mockResolvedValue(undetermined);
  runtime.locationRead.mockResolvedValue(undetermined);
  runtime.pushAsk.mockResolvedValue(denied);
  runtime.locationAsk.mockResolvedValue(denied);
  runtime.services.mockResolvedValue(true);
  runtime.locate.mockResolvedValue(undefined);
  runtime.enable.mockResolvedValue(undefined);
  runtime.settings.mockResolvedValue(undefined);
});
afterEach(async () => {
  await act(() => root?.unmount());
  root = null;
  runtime.listeners.clear();
  vi.unstubAllGlobals();
});
describe('native permission startup', () => {
  it('asks before sign-in and waits for notifications to close before requesting location', async () => {
    let answer!: (value: typeof denied) => void;
    runtime.pushAsk.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    await render();
    expect(runtime.pushAsk).toHaveBeenCalledOnce();
    expect(runtime.locationAsk).not.toHaveBeenCalled();
    expect(value.ready).toBe(false);
    await act(() => answer(denied));
    expect(runtime.locationAsk).toHaveBeenCalledOnce();
    expect(value.ready).toBe(true);
    expect(value.notificationsOff).toBe(true);
    expect(value.locationOff).toBe(true);
    expect(runtime.enable).not.toHaveBeenCalled();
  });
  it('does not repeat declined OS prompts on relaunch and opens Settings when iOS cannot ask again', async () => {
    await render();
    await act(() => root?.unmount());
    root = null;
    runtime.pushRead.mockResolvedValue(denied);
    runtime.locationRead.mockResolvedValue(denied);
    await render();
    expect(runtime.pushAsk).toHaveBeenCalledOnce();
    expect(runtime.locationAsk).toHaveBeenCalledOnce();
    await act(() => value.enable());
    expect(runtime.settings).toHaveBeenCalledOnce();
    expect(runtime.pushAsk).toHaveBeenCalledOnce();
  });
  it('registers an earlier OS grant after sign-in and reminds again on a later app opening', async () => {
    runtime.pushRead.mockResolvedValue(granted);
    runtime.locationRead.mockResolvedValue(granted);
    await render();
    expect(runtime.locate).toHaveBeenCalledOnce();
    expect(runtime.enable).not.toHaveBeenCalled();
    runtime.session = { user: { id: 'owner' } };
    await render();
    expect(runtime.enable).toHaveBeenCalledOnce();
    await act(() => value.dismiss());
    expect(value.dismissed).toBe(true);
    runtime.pushRead.mockResolvedValue(denied);
    await act(() => {
      for (const fn of runtime.listeners) {
        fn('background');
        fn('inactive');
        fn('active');
      }
    });
    expect(value.dismissed).toBe(false);
    expect(value.notificationsOff).toBe(true);
    expect(runtime.pushAsk).not.toHaveBeenCalled();
  });
  it('opens Settings for disabled location services even with a location grant', async () => {
    runtime.pushRead.mockResolvedValue(granted);
    runtime.locationRead.mockResolvedValue(granted);
    await render();
    runtime.services.mockResolvedValue(false);
    await act(() => value.enable());
    expect(runtime.settings).toHaveBeenCalledOnce();
  });
  it('still asks for location when the notification permission check fails', async () => {
    runtime.pushRead.mockRejectedValueOnce(new Error('Notification service unavailable'));
    await render();
    expect(runtime.locationAsk).toHaveBeenCalledOnce();
    expect(value.ready).toBe(true);
    expect(value.busy).toBe(false);
    expect(value.issue).toContain('notifications');
  });
  it('requests location before waiting for push token registration', async () => {
    runtime.session = { user: { id: 'owner' } };
    runtime.pushRead.mockResolvedValue(granted);
    let registered!: () => void;
    runtime.enable.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        registered = resolve;
      }),
    );
    await render();
    expect(runtime.locationAsk).toHaveBeenCalledOnce();
    expect(runtime.enable).toHaveBeenCalledOnce();
    await act(() => registered());
    expect(value.ready).toBe(true);
  });
  it('does not transfer automatic push opt-in to another account while a location prompt is open', async () => {
    runtime.session = { user: { id: 'owner' } };
    runtime.pushRead.mockResolvedValue(granted);
    let located!: (grant: typeof denied) => void;
    runtime.locationAsk.mockReturnValueOnce(
      new Promise((resolve) => {
        located = resolve;
      }),
    );
    await render();
    runtime.session = { user: { id: 'other' } };
    localStorage.setItem('dwd.mobile.push.v1:other', 'disabled');
    await render();
    await act(() => located(denied));
    expect(runtime.enable).not.toHaveBeenCalled();
    expect(value.ready).toBe(true);
  });
});
