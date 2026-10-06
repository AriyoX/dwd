export interface EncryptedStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

// Supabase sessions can exceed older Keychain value limits. Every chunk is encrypted;
// the manifest switches only after all chunks have been written successfully.
export function createSecureAuthStorage(
  encrypted: EncryptedStore,
  legacy: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  randomId: () => string,
) {
  const marker = 'dwd.secure-auth.install.v1';
  const freshInstall = legacy.getItem(marker) === null;
  legacy.setItem(marker, '1');
  const touched = new Set<string>();
  let tail: Promise<unknown> = Promise.resolve();
  const serialize = <T>(operation: () => Promise<T>) => {
    const pending = tail.then(operation, operation);
    tail = pending.catch(() => undefined);
    return pending;
  };
  const manifestKey = (key: string) => `dwd.auth.${key}`;
  async function readManifest(key: string): Promise<{ id: string; count: number } | null> {
    const raw = await encrypted.getItemAsync(manifestKey(key));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('id' in parsed) ||
      !('count' in parsed) ||
      typeof parsed.id !== 'string' ||
      !/^[a-zA-Z0-9-]+$/.test(parsed.id) ||
      typeof parsed.count !== 'number' ||
      !Number.isInteger(parsed.count) ||
      parsed.count < 1 ||
      parsed.count > 200
    )
      throw new Error('Encrypted session is unreadable.');
    return { id: parsed.id, count: parsed.count };
  }
  async function removeChunks(key: string, manifest: { id: string; count: number } | null) {
    if (manifest)
      for (let i = 0; i < manifest.count; i++)
        await encrypted.deleteItemAsync(`${manifestKey(key)}.${manifest.id}.${i}`);
  }
  async function prepare(key: string) {
    if (touched.has(key)) return;
    // iOS Keychain survives uninstall. A new install without a legacy session must
    // never restore credentials belonging to the previous installation.
    if (freshInstall && !legacy.getItem(key)) {
      const previous = await readManifest(key);
      await encrypted.deleteItemAsync(manifestKey(key));
      await removeChunks(key, previous);
    }
    touched.add(key);
  }
  async function write(key: string, value: string) {
    const previous = await readManifest(key);
    const id = randomId();
    const chunks = value.match(/[\s\S]{1,500}/g) ?? [''];
    if (chunks.length > 200) throw new Error('Session is too large.');
    for (const [i, chunk] of chunks.entries())
      await encrypted.setItemAsync(`${manifestKey(key)}.${id}.${i}`, chunk);
    await encrypted.setItemAsync(manifestKey(key), JSON.stringify({ id, count: chunks.length }));
    legacy.removeItem(key);
    await removeChunks(key, previous);
  }
  return {
    getItem: (key: string) =>
      serialize(async () => {
        await prepare(key);
        const manifest = await readManifest(key);
        if (manifest) {
          const chunks = [];
          for (let i = 0; i < manifest.count; i++) {
            const value = await encrypted.getItemAsync(`${manifestKey(key)}.${manifest.id}.${i}`);
            if (value === null) throw new Error('Encrypted session is incomplete.');
            chunks.push(value);
          }
          return chunks.join('');
        }
        const old = legacy.getItem(key);
        if (old !== null) await write(key, old);
        return old;
      }),
    setItem: (key: string, value: string) =>
      serialize(async () => {
        await prepare(key);
        await write(key, value);
      }),
    removeItem: (key: string) =>
      serialize(async () => {
        await prepare(key);
        const previous = await readManifest(key);
        legacy.removeItem(key);
        await encrypted.deleteItemAsync(manifestKey(key));
        await removeChunks(key, previous);
      }),
  };
}
