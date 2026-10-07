/* eslint-disable @typescript-eslint/no-deprecated -- Exercise native network events without a device. */
import { createElement, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectivityProvider, useConnectivity } from '@/providers/connectivity-provider';

type NetworkState = { isConnected?: boolean; isInternetReachable?: boolean };
const runtime = vi.hoisted(() => ({
  get: vi.fn(),
  networks: new Set<(value: NetworkState) => void>(),
  foreground: new Set<(value: string) => void>(),
  publish: vi.fn(),
}));
vi.mock('expo-network', () => ({
  getNetworkStateAsync: runtime.get,
  addNetworkStateListener: (fn: (value: NetworkState) => void) => {
    runtime.networks.add(fn);
    return { remove: () => runtime.networks.delete(fn) };
  },
}));
vi.mock('react-native', () => ({
  AppState: {
    addEventListener: (_event: string, fn: (value: string) => void) => {
      runtime.foreground.add(fn);
      return { remove: () => runtime.foreground.delete(fn) };
    },
  },
}));
let root: ReactTestRenderer | null = null;
function Probe() {
  const { online } = useConnectivity();
  useEffect(() => {
    runtime.publish(online);
  }, [online]);
  return null;
}
async function mount() {
  await act(() => {
    root = create(createElement(ConnectivityProvider, null, createElement(Probe)));
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  runtime.get.mockResolvedValue({ isConnected: true, isInternetReachable: true });
});
afterEach(async () => {
  await act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe('native connectivity', () => {
  it('publishes offline and reconnection events and removes listeners on unmount', async () => {
    await mount();
    expect(runtime.publish).toHaveBeenLastCalledWith(true);
    await act(() => {
      for (const listener of runtime.networks) listener({ isConnected: false });
    });
    expect(runtime.publish).toHaveBeenLastCalledWith(false);
    await act(() => {
      for (const listener of runtime.networks)
        listener({ isConnected: true, isInternetReachable: true });
    });
    expect(runtime.publish).toHaveBeenLastCalledWith(true);
    await act(() => root?.unmount());
    root = null;
    expect(runtime.networks.size).toBe(0);
    expect(runtime.foreground.size).toBe(0);
  });
  it('ignores a stale initial read after a newer network event', async () => {
    let finish: ((value: NetworkState) => void) | undefined;
    runtime.get.mockImplementationOnce(
      () =>
        new Promise<NetworkState>((resolve) => {
          finish = resolve;
        }),
    );
    await mount();
    await act(() => {
      for (const listener of runtime.networks) listener({ isConnected: false });
    });
    await act(() => {
      finish?.({ isConnected: true, isInternetReachable: true });
    });
    expect(runtime.publish).toHaveBeenLastCalledWith(false);
  });
  it('keeps unknown reachability distinct from offline so the app can still make a request', async () => {
    runtime.get.mockRejectedValueOnce(new Error('Unsupported probe'));
    await mount();
    expect(runtime.publish).toHaveBeenLastCalledWith(null);
    await act(() => {
      for (const listener of runtime.networks) listener({ isConnected: true });
    });
    expect(runtime.publish).toHaveBeenLastCalledWith(null);
  });
  it('refreshes after returning to the foreground', async () => {
    await mount();
    runtime.get.mockResolvedValue({ isConnected: false });
    await act(() => {
      for (const listener of runtime.foreground) listener('active');
    });
    expect(runtime.publish).toHaveBeenLastCalledWith(false);
  });
});
