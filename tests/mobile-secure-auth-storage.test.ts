import { describe, expect, it, vi } from 'vitest';
import { createSecureAuthStorage } from '../apps/mobile/src/lib/secure-auth-storage';

function fixture() {
  const plain = new Map<string, string>();
  const secure = new Map<string, string>();
  const legacy = {
    getItem: (key: string) => plain.get(key) ?? null,
    setItem: (key: string, value: string) => {
      plain.set(key, value);
    },
    removeItem: (key: string) => {
      plain.delete(key);
    },
  };
  const encrypted = {
    getItemAsync: vi.fn((key: string) => Promise.resolve(secure.get(key) ?? null)),
    setItemAsync: vi.fn((key: string, value: string) => {
      secure.set(key, value);
      return Promise.resolve();
    }),
    deleteItemAsync: vi.fn((key: string) => {
      secure.delete(key);
      return Promise.resolve();
    }),
  };
  let id = 0;
  const build = () => createSecureAuthStorage(encrypted, legacy, () => `generation-${++id}`);
  return { plain, secure, encrypted, legacy, build };
}
describe('encrypted native sessions and PKCE verifiers', () => {
  it('migrates existing tokens, removes the plaintext copy, and survives restart', async () => {
    const f = fixture();
    const value = 'token'.repeat(1800);
    f.plain.set('session', value);
    expect(await f.build().getItem('session')).toBe(value);
    expect(f.plain.has('session')).toBe(false);
    expect(await f.build().getItem('session')).toBe(value);
    expect(f.secure.size).toBeGreaterThan(2);
  });
  it('preserves the legacy session when encrypted migration fails', async () => {
    const f = fixture();
    f.plain.set('session', 'old');
    f.encrypted.setItemAsync.mockRejectedValueOnce(new Error('Locked'));
    await expect(f.build().getItem('session')).rejects.toThrow('Locked');
    expect(f.plain.get('session')).toBe('old');
  });
  it('keeps the committed encrypted value after an interrupted refresh', async () => {
    const f = fixture();
    const storage = f.build();
    await storage.setItem('session', 'old');
    f.encrypted.setItemAsync.mockRejectedValueOnce(new Error('Full'));
    await expect(storage.setItem('session', 'new')).rejects.toThrow();
    expect(await storage.getItem('session')).toBe('old');
  });
  it('does not restore an iOS Keychain session after uninstall', async () => {
    const f = fixture();
    await f.build().setItem('session', 'previous-install');
    f.plain.clear();
    expect(await f.build().getItem('session')).toBeNull();
    expect(f.secure.size).toBe(0);
  });
  it('clears both old and encrypted tokens on sign-out, including offline restoration', async () => {
    const f = fixture();
    const storage = f.build();
    await storage.setItem('session', 'token');
    f.plain.set('session', 'stale');
    await storage.removeItem('session');
    expect(await storage.getItem('session')).toBeNull();
    expect(f.plain.has('session')).toBe(false);
    expect(f.secure.size).toBe(0);
  });
  it('serializes reads and writes so a refresh cannot undo sign-out', async () => {
    const f = fixture();
    const storage = f.build();
    await Promise.all([
      storage.setItem('session', 'one'),
      storage.setItem('session', 'two'),
      storage.removeItem('session'),
    ]);
    expect(await storage.getItem('session')).toBeNull();
  });
});
