type CacheStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const keyFor = (owner: string, scope: string) => `dwd.mobile.cache.v1:${owner}:${scope}`;

export function readOfflineCache(storage: CacheStorage, owner: string, scope: string): unknown {
  try {
    const raw = storage.getItem(keyFor(owner, scope));
    if (!raw) return null;
    const record = JSON.parse(raw) as { owner: string; scope: string; value: unknown };
    return record.owner === owner && record.scope === scope ? record.value : null;
  } catch {
    return null;
  }
}

export function writeOfflineCache(
  storage: CacheStorage,
  owner: string,
  scope: string,
  value: unknown,
) {
  try {
    storage.setItem(keyFor(owner, scope), JSON.stringify({ owner, scope, value }));
  } catch {
    /* A cache failure must not block an online read. The outbox reports write failures. */
  }
}

export function clearOfflineCache(storage: CacheStorage, owner: string, scope: string) {
  try {
    storage.removeItem(keyFor(owner, scope));
  } catch {
    /* Best effort cache cleanup. */
  }
}

export function isConnectionFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { message?: string; name?: string; code?: string; status?: number };
  if (value.code || (value.status && value.status >= 400 && value.status < 500)) return false;
  return (
    /fetch|network|offline|connection|timeout|timed out/i.test(value.message ?? '') ||
    value.name === 'AuthRetryableFetchError'
  );
}

export function resolveProfileRead(
  storage: CacheStorage,
  owner: string,
  found: boolean,
  error: unknown,
): 'complete' | 'incomplete' | 'error' {
  if (!error) {
    if (found) writeOfflineCache(storage, owner, 'profile-complete', true);
    else clearOfflineCache(storage, owner, 'profile-complete');
    return found ? 'complete' : 'incomplete';
  }
  if (isConnectionFailure(error))
    return readOfflineCache(storage, owner, 'profile-complete') === true ? 'complete' : 'error';
  clearOfflineCache(storage, owner, 'profile-complete');
  return 'error';
}
