import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ environment: 'storeClient', imported: vi.fn() }));
vi.mock('expo-constants', () => ({
  default: {
    get executionEnvironment() {
      return runtime.environment;
    },
  },
  ExecutionEnvironment: { StoreClient: 'storeClient' },
}));
vi.mock('expo-notifications', () => {
  runtime.imported();
  if (runtime.environment === 'storeClient') throw new Error('Android Expo Go push import');
  return { getPermissionsAsync: vi.fn() };
});

beforeEach(() => {
  vi.resetModules();
  runtime.imported.mockClear();
});

describe('notification SDK loading', () => {
  it('does not evaluate the SDK in Expo Go', async () => {
    runtime.environment = 'storeClient';
    const { loadNotificationSdk } = await import('@/lib/notification-sdk');
    await expect(loadNotificationSdk()).resolves.toBeNull();
    expect(runtime.imported).not.toHaveBeenCalled();
  });

  it('shares SDK loading across concurrent callers in an installed build', async () => {
    runtime.environment = 'standalone';
    const { loadNotificationSdk } = await import('@/lib/notification-sdk');
    const first = loadNotificationSdk();
    const second = loadNotificationSdk();
    expect(second).toBe(first);
    const [sdk, shared] = await Promise.all([first, second]);
    expect(sdk).toHaveProperty('getPermissionsAsync');
    expect(shared).toBe(sdk);
    expect(loadNotificationSdk()).toBe(first);
    expect(runtime.imported).toHaveBeenCalledOnce();
  });
});
