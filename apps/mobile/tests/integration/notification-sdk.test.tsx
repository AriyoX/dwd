import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDevicePushTokenAsync } from 'expo-notifications/build/getDevicePushTokenAsync';

const native = vi.hoisted(() => ({ getToken: vi.fn<() => Promise<string>>() }));
vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'android' },
  UnavailabilityError: class extends Error {},
}));
vi.mock('expo-notifications/build/PushTokenManager', () => ({
  default: { getDevicePushTokenAsync: native.getToken },
}));
vi.mock('expo-notifications/build/warnOfExpoGoPushUsage', () => ({
  warnOfExpoGoPushUsage: () => undefined,
}));

beforeEach(() => native.getToken.mockReset());

describe('installed Expo notification SDK', () => {
  it('shares an in-flight native request and can retry after that request fails', async () => {
    let fail: (error: Error) => void = () => {
      throw new Error('Missing native request');
    };
    const attempt = new Promise<string>((_resolve, reject) => {
      fail = reject;
    });
    native.getToken.mockReturnValueOnce(attempt).mockResolvedValueOnce('fcm-token');
    const first = getDevicePushTokenAsync();
    const second = getDevicePushTokenAsync();
    const settled = Promise.allSettled([first, second]);
    expect(native.getToken).toHaveBeenCalledOnce();
    fail(new Error('Internet unavailable'));
    expect((await settled).map((result) => result.status)).toEqual(['rejected', 'rejected']);
    await expect(getDevicePushTokenAsync()).resolves.toEqual({
      type: 'android',
      data: 'fcm-token',
    });
    expect(native.getToken).toHaveBeenCalledTimes(2);
  });

  it('can request a fresh token after a successful registration', async () => {
    native.getToken.mockResolvedValueOnce('old-token').mockResolvedValueOnce('new-token');
    await expect(getDevicePushTokenAsync()).resolves.toMatchObject({ data: 'old-token' });
    await expect(getDevicePushTokenAsync()).resolves.toMatchObject({ data: 'new-token' });
    expect(native.getToken).toHaveBeenCalledTimes(2);
  });
});
