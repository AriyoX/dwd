import { describe, expect, it } from 'vitest';
import { authRedirect, type AccessState } from '../apps/mobile/src/lib/auth-routing';
import {
  AuthHandoff,
  captureNativeDestination,
  safeDestination,
} from '../apps/mobile/src/lib/auth-state';
import { safeReturnPath } from '../apps/web/src/lib/navigation';

describe('public Quick Log navigation', () => {
  it.each(['restoring', 'signed-out', 'profile', 'recovery', 'ready'] as AccessState[])(
    'bypasses account and introduction guards in %s',
    (access) => {
      for (const path of ['/quick-log', '/quick-history', '/quick-transfer'])
        expect(authRedirect(access, path, false)).toBeNull();
    },
  );
  it('retains the local source and invite return through the existing deep-link and sign-in handoff', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
    const handoff = new AuthHandoff(storage);
    const token = 'a'.repeat(43);
    expect(captureNativeDestination(`https://example.test/join/${token}`, handoff)).toBe(
      `/join?token=${token}`,
    );
    expect(handoff.read().next).toBe(`/join?token=${token}`);
    const returnTo = '/quick-transfer?scope=guest&sessionId=11000000-0000-4000-8000-000000000001';
    handoff.remember(returnTo);
    expect(handoff.read().next).toBe(returnTo);
    expect(safeReturnPath('/quick-log/add?scope=guest')).toBe('/quick-log/add?scope=guest');
    expect(safeDestination('/quick-transfer?scope=account:another')).toBe('/');
  });
});
