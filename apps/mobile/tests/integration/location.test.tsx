/* eslint-disable @typescript-eslint/no-deprecated, react-hooks/globals -- A mounted probe captures context for permission assertions. */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocationProvider, useCountryLocation } from '../../src/providers/location-provider';

const runtime = vi.hoisted(() => ({
  permission: vi.fn(),
  request: vi.fn(),
  position: vi.fn(),
  save: vi.fn(),
  state: 'active',
  foreground: undefined as undefined | ((state: string) => void),
}));
vi.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return runtime.state;
    },
    addEventListener: (_: string, callback: (state: string) => void) => {
      runtime.foreground = callback;
      return {
        remove: () => {
          runtime.foreground = undefined;
        },
      };
    },
  },
}));
vi.mock('expo-location', () => ({
  PermissionStatus: { UNDETERMINED: 'undetermined' },
  Accuracy: { Lowest: 1 },
  getForegroundPermissionsAsync: runtime.permission,
  requestForegroundPermissionsAsync: runtime.request,
  getCurrentPositionAsync: runtime.position,
}));
vi.mock('@dwd/data', () => ({ updatePreplotCountry: runtime.save }));
vi.mock('@/lib/actor-client', () => ({ actorClient: () => ({ owner: 'signed-in' }) }));
vi.mock('@/providers/supabase-provider', () => ({
  useSupabase: () => ({
    client: {},
    session: { access_token: 'test-token' },
    access: 'ready',
  }),
}));
let root: ReactTestRenderer | null = null;
let value: ReturnType<typeof useCountryLocation>;
function Probe() {
  value = useCountryLocation();
  return null;
}
const denied = { granted: false, status: 'denied' };
const granted = { granted: true, status: 'granted' };
const kenya = { coords: { latitude: -1.2864, longitude: 36.8172 } };
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  runtime.state = 'active';
  runtime.permission.mockReset().mockResolvedValue(denied);
  runtime.request.mockReset().mockResolvedValue(granted);
  runtime.position.mockReset().mockResolvedValue(kenya);
  runtime.save.mockReset().mockResolvedValue(undefined);
});
afterEach(async () => {
  await act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});
async function mount() {
  await act(() => {
    root = create(createElement(LocationProvider, null, createElement(Probe)));
  });
}
async function foreground(state: string) {
  runtime.state = state;
  await act(() => runtime.foreground?.(state));
}
describe('opt-in native location', () => {
  it('keeps location off across foreground refreshes and remounts', async () => {
    runtime.permission.mockResolvedValue(granted);
    await mount();
    await act(() => value.disable());
    expect(value.location.countryCode).toBe('UG');
    runtime.position.mockClear();
    await foreground('active');
    await act(() => root?.unmount());
    await mount();
    expect(value.enabled).toBe(false);
    expect(runtime.position).not.toHaveBeenCalled();
    await act(() => value.request());
    expect(value.location.countryCode).toBe('KE');
    expect(value.enabled).toBe(true);
  });
  it('ignores an in-flight fix after turning location off', async () => {
    localStorage.setItem('dwd.location.enabled', 'true');
    let resolve: (position: typeof kenya) => void = () => {};
    runtime.permission.mockResolvedValue(granted);
    runtime.position.mockReturnValue(
      new Promise<typeof kenya>((done) => {
        resolve = done;
      }),
    );
    await mount();
    await act(() => value.disable());
    await act(() => resolve(kenya));
    expect(value.location.countryCode).toBe('UG');
    expect(value.enabled).toBe(false);
    expect(runtime.save).not.toHaveBeenCalledWith({ owner: 'signed-in' }, 'KE', 'national');
  });
  it('defaults to Uganda without opening the OS permission prompt', async () => {
    await mount();
    expect(value.location.countryCode).toBe('UG');
    expect(runtime.request).not.toHaveBeenCalled();
    expect(runtime.position).not.toHaveBeenCalled();
    expect(runtime.permission).not.toHaveBeenCalled();
    expect(value.enabled).toBe(false);
    expect(runtime.save).toHaveBeenLastCalledWith({ owner: 'signed-in' }, 'UG', 'national');
  });
  it('uses existing permission only after a saved opt-in and requests a low-accuracy fix', async () => {
    localStorage.setItem('dwd.location.enabled', 'true');
    runtime.permission.mockResolvedValue(granted);
    await mount();
    expect(value.location.countryCode).toBe('KE');
    expect(runtime.request).not.toHaveBeenCalled();
    expect(runtime.position).toHaveBeenCalledWith({
      accuracy: 1,
      mayShowUserSettingsDialog: false,
    });
    expect(runtime.save).toHaveBeenLastCalledWith({ owner: 'signed-in' }, 'KE', 'national');
  });
  it('opens the OS prompt only after the disclosed location action', async () => {
    await mount();
    await act(() => value.request());
    expect(runtime.request).toHaveBeenCalledOnce();
    expect(value.location.countryCode).toBe('KE');
  });
  it('refreshes on return and falls back after permission is revoked', async () => {
    localStorage.setItem('dwd.location.enabled', 'true');
    runtime.permission.mockResolvedValue(granted);
    await mount();
    await foreground('background');
    runtime.permission.mockResolvedValue(denied);
    await foreground('active');
    expect(value.location).toMatchObject({ countryCode: 'UG', source: 'default' });
    expect(runtime.request).not.toHaveBeenCalled();
  });
  it('ignores a stale location result after leaving the foreground', async () => {
    localStorage.setItem('dwd.location.enabled', 'true');
    let resolve: (position: typeof kenya) => void = () => {};
    runtime.permission.mockResolvedValue(granted);
    runtime.position.mockReturnValue(
      new Promise<typeof kenya>((done) => {
        resolve = done;
      }),
    );
    await mount();
    await foreground('background');
    await act(() => resolve(kenya));
    expect(value.location.countryCode).toBe('UG');
    expect(runtime.save).not.toHaveBeenCalled();
  });
  it('keeps Uganda when location is unavailable or outside supported countries', async () => {
    localStorage.setItem('dwd.location.enabled', 'true');
    runtime.permission.mockResolvedValue(granted);
    runtime.position.mockRejectedValue(new Error('Unavailable'));
    await mount();
    expect(value.location.countryCode).toBe('UG');
    runtime.position.mockResolvedValue({ coords: { latitude: 52.52, longitude: 13.405 } });
    await foreground('active');
    expect(value.location).toMatchObject({ countryCode: 'UG', source: 'default' });
  });
});
