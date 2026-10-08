import { describe, expect, it, vi } from 'vitest';
import { requestInitialPermission } from '../apps/mobile/src/lib/initial-permissions';

const undetermined = { granted: false, canAskAgain: true, status: 'undetermined' };
describe('first-launch permissions', () => {
  it('asks each permission once and remembers a declined prompt across launches', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const read = vi.fn().mockResolvedValue(undetermined);
    const request = vi.fn().mockResolvedValue({ ...undetermined, status: 'denied' });
    await requestInitialPermission(storage, 'notifications', read, request);
    await requestInitialPermission(storage, 'notifications', read, request);
    expect(request).toHaveBeenCalledOnce();
    await requestInitialPermission(storage, 'location', read, request);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it.each([
    { granted: true, canAskAgain: true, status: 'granted' },
    { granted: false, canAskAgain: false, status: 'denied' },
  ])('does not prompt over an existing OS decision: $status', async (grant) => {
    const request = vi.fn();
    const storage = { getItem: () => null, setItem: vi.fn() };
    expect(
      await requestInitialPermission(
        storage,
        'notifications',
        () => Promise.resolve(grant),
        request,
      ),
    ).toEqual(grant);
    expect(request).not.toHaveBeenCalled();
  });
  it('allows a startup failure to be retried instead of recording a prompt that never opened', async () => {
    const storage = { getItem: () => null, setItem: vi.fn() };
    await expect(
      requestInitialPermission(
        storage,
        'location',
        () => Promise.resolve(undetermined),
        () => Promise.reject(new Error('unavailable')),
      ),
    ).rejects.toThrow();
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
