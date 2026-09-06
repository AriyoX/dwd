import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PendingDrinkLog } from '@dwd/contracts';
import { BrowserPendingLogStore } from './pending-log-store.browser';

const currentKey = 'dwd:pending-logs:v1';
const previousKey = 'drink-mates:pending-logs:v1';

function pending(overrides: Partial<PendingDrinkLog> = {}): PendingDrinkLog {
  return {
    idempotencyKey: '00000000-0000-4000-8000-000000000001',
    actorUserId: '00000000-0000-4000-8000-000000000002',
    nightId: '00000000-0000-4000-8000-000000000003',
    nightMemberId: '00000000-0000-4000-8000-000000000004',
    memberDisplayName: 'Alex',
    kind: 'water',
    consumedAt: '2026-09-06T19:00:00.000Z',
    createdLocallyAt: '2026-09-06T19:00:00.000Z',
    status: 'pending',
    retryCount: 0,
    acknowledgePlanExceeded: false,
    acknowledgeAfterEnd: false,
    ...overrides,
  };
}

function setup(values: Record<string, PendingDrinkLog[]>) {
  const data = new Map(Object.entries(values).map(([key, logs]) => [key, JSON.stringify(logs)]));
  const storage = {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => data.set(key, value)),
    removeItem: vi.fn((key: string) => data.delete(key)),
  };
  vi.stubGlobal('window', { localStorage: storage });
  return { store: new BrowserPendingLogStore(), storage, data };
}

afterEach(() => vi.unstubAllGlobals());

describe('pending logs after the brand rename', () => {
  it('preserves queued logs and uses the newer state of duplicate entries', async () => {
    const latest = pending({ status: 'needs_confirmation', retryCount: 1 });
    const second = pending({ idempotencyKey: '00000000-0000-4000-8000-000000000005' });
    const { store, data } = setup({
      [previousKey]: [pending(), second],
      [currentKey]: [latest],
    });
    expect(await store.getAll()).toEqual([latest, second]);
    expect(JSON.parse(data.get(currentKey) ?? 'null')).toEqual([latest, second]);
    expect(data.has(previousKey)).toBe(false);
  });

  it('keeps the old queue recoverable when storage is full', async () => {
    const log = pending();
    const { store, storage, data } = setup({ [previousKey]: [log] });
    storage.setItem.mockImplementation(() => {
      throw new Error('Quota exceeded');
    });
    expect(await store.getAll()).toEqual([log]);
    expect(JSON.parse(data.get(previousKey) ?? 'null')).toEqual([log]);
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it('does not bring back a migrated entry after the user removes it', async () => {
    const log = pending();
    const { store, data } = setup({ [previousKey]: [log] });
    await store.remove(log.idempotencyKey);
    expect(await store.getAll()).toEqual([]);
    expect(data.has(previousKey)).toBe(false);
  });
});
