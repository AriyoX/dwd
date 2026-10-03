import { describe, expect, it, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database, DrinkLogResult, NightSnapshot } from '@dwd/core';
import {
  makePendingLog,
  NativeLogOutbox,
  NativePendingLogStore,
  pendingForSnapshot,
  type NativePendingLog,
} from '../apps/mobile/src/lib/offline-logging';
import { nativeLogSender } from '../apps/mobile/src/lib/offline-logging-api';
import {
  clearOfflineCache,
  isConnectionFailure,
  readOfflineCache,
  resolveProfileRead,
  writeOfflineCache,
} from '../apps/mobile/src/lib/offline-cache';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const owner = id(1);
const time = '2026-10-03T18:00:00.000Z';
const drink = { label: 'Beer', category: 'beer' as const, volumeMl: 330, abvPercent: 5 };
function snapshot(): NightSnapshot {
  return {
    currentUserId: owner,
    currentMemberId: id(2),
    alerts: [],
    endTimeChanges: [],
    night: {
      id: id(3),
      hostUserId: owner,
      title: 'Night',
      status: 'active',
      startsAt: '2026-10-03T17:00:00.000Z',
      initialEndsAt: '2026-10-03T20:00:00.000Z',
      endsAt: '2026-10-03T20:00:00.000Z',
      endedAt: null,
      timezone: 'Africa/Nairobi',
    },
    members: [
      {
        id: id(2),
        nightId: id(3),
        userId: owner,
        role: 'host',
        memberType: 'account',
        displayName: 'You',
        managedByUserId: null,
        joinedAt: time,
        leftAt: null,
        planSetupCompletedAt: time,
        planRevision: 1,
        drinkLogs: [],
        waterLogs: [],
        planItems: [
          {
            ...drink,
            id: id(4),
            nightMemberId: id(2),
            createdBy: owner,
            createdAt: time,
            updatedAt: time,
            archivedAt: null,
            plannedQuantity: 2,
            isQuickLog: true,
          },
        ],
      },
    ],
  };
}
function record(n = 10, choice: Parameters<typeof makePendingLog>[2] = { planItemId: id(4) }) {
  return makePendingLog(snapshot(), id(2), choice, [], id(n), time);
}
function device() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}
function accepted(pending: NativePendingLog, status: 'created' | 'duplicate' = 'created') {
  const base = {
    id: id(50),
    nightId: pending.nightId,
    nightMemberId: pending.nightMemberId,
    actorUserId: pending.actorUserId,
    consumedAt: pending.consumedAt,
    createdAt: time,
    idempotencyKey: pending.idempotencyKey,
    deletedAt: null,
  };
  return pending.kind === 'water'
    ? { status, log: base }
    : {
        status,
        log: {
          ...base,
          planItemId: pending.planItemId ?? null,
          labelSnapshot: drink.label,
          categorySnapshot: drink.category,
          volumeMl: drink.volumeMl,
          abvPercent: drink.abvPercent,
          ethanolGrams: 13.035,
          afterEnd: false,
        },
        alerts: [],
      };
}
function fixture() {
  const storage = device();
  const store = new NativePendingLogStore(storage, owner);
  let current = true;
  const sender = {
    current: () => current,
    send: vi.fn((pending: NativePendingLog) => Promise.resolve(accepted(pending))),
    delete: vi.fn(() => Promise.resolve()),
  };
  const changed = vi.fn();
  const outbox = new NativeLogOutbox(store, sender, changed);
  return {
    storage,
    store,
    sender,
    outbox,
    changed,
    signOut: () => {
      current = false;
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('native durable outbox', () => {
  it('survives a restart for planned drinks, chasers and custom drinks without changing their IDs or time', async () => {
    const f = fixture();
    const records = [record(), record(11, 'water'), record(12, { customDrink: drink })];
    for (const entry of records) f.outbox.enqueue(entry);
    expect(f.sender.send).not.toHaveBeenCalled();
    const restored = new NativePendingLogStore(f.storage, owner);
    expect(restored.getAll()).toEqual(records);
    await new NativeLogOutbox(restored, f.sender).retryAll();
    expect(
      f.sender.send.mock.calls.map(([entry]) => [entry.idempotencyKey, entry.consumedAt]),
    ).toEqual(records.map((entry) => [entry.idempotencyKey, entry.consumedAt]));
    expect(restored.getAll()).toEqual([]);
  });

  it('keeps shared bottle pours out of the offline queue so remaining volume must be checked online', () => {
    const f = fixture();
    expect(() =>
      f.outbox.enqueue(record(12, { customDrink: { ...drink, sharedBottleId: id(70) } })),
    ).toThrow('Shared bottles require a connection');
    expect(f.store.getAll()).toEqual([]);
    expect(f.sender.send).not.toHaveBeenCalled();
  });

  it('replays chronologically, serializes concurrent retry requests and stops on a lost connection', async () => {
    const f = fixture();
    f.outbox.enqueue({ ...record(11), createdLocallyAt: '2026-10-03T18:00:01.000Z' });
    f.outbox.enqueue(record());
    const request = deferred<ReturnType<typeof accepted>>();
    f.sender.send.mockReturnValueOnce(request.promise);
    const replay = f.outbox.retryAll();
    expect(f.outbox.retryAll()).toBe(replay);
    expect(f.outbox.syncOne(id(10))).toBe(f.outbox.syncOne(id(10)));
    expect(f.sender.send).toHaveBeenCalledTimes(1);
    request.resolve(accepted(record()));
    f.sender.send.mockRejectedValueOnce(new Error('Network request failed'));
    await replay;
    expect(f.sender.send.mock.calls.map(([entry]) => entry.idempotencyKey)).toEqual([
      id(10),
      id(11),
    ]);
    expect(f.store.getAll()).toMatchObject([{ status: 'failed', attempted: true, retryCount: 1 }]);
  });

  it('reconciles a server-accepted request whose response was lost using the original key', async () => {
    const f = fixture();
    const pending = record();
    f.outbox.enqueue(pending);
    f.sender.send.mockRejectedValueOnce(new Error('Response lost'));
    await f.outbox.syncOne(pending.idempotencyKey);
    const restored = new NativePendingLogStore(f.storage, owner);
    f.sender.send.mockResolvedValueOnce(accepted(pending, 'duplicate'));
    await new NativeLogOutbox(restored, f.sender, f.changed).retryAll();
    expect(
      f.sender.send.mock.calls.every(
        ([entry]) => entry.idempotencyKey === pending.idempotencyKey && entry.consumedAt === time,
      ),
    ).toBe(true);
    expect(restored.getAll()).toEqual([]);
    expect(f.changed).toHaveBeenCalledWith(true);
  });

  it('recovers a syncing entry left by process termination', async () => {
    const f = fixture();
    f.store.save({ ...record(), status: 'syncing', attempted: true });
    await f.outbox.retryAll();
    expect(f.sender.send).toHaveBeenCalledTimes(1);
    expect(f.store.getAll()).toEqual([]);
  });

  it('never sends an entry if durable storage failed before enqueue', () => {
    const f = fixture();
    vi.spyOn(f.storage, 'setItem').mockImplementation(() => {
      throw new Error('Storage full');
    });
    expect(() => f.outbox.enqueue(record())).toThrow('Storage full');
    expect(f.sender.send).not.toHaveBeenCalled();
  });

  it('retains corrupt storage and refuses to overwrite it with a new queue', () => {
    const f = fixture();
    f.storage.setItem(`dwd.mobile.pending-logs.v1:${owner}`, '{corrupt');
    expect(() => f.store.getAll()).toThrow();
    expect(() => f.outbox.enqueue(record())).toThrow();
    expect([...f.storage.data.values()]).toEqual(['{corrupt']);
  });

  it('preserves accepted results if local cleanup fails and safely retries their key', async () => {
    const f = fixture();
    f.outbox.enqueue(record());
    const remove = vi.spyOn(f.store, 'remove').mockImplementationOnce(() => {
      throw new Error('Disk unavailable');
    });
    expect(await f.outbox.syncOne(id(10))).toBe('synced');
    expect(f.changed).toHaveBeenCalledWith(true);
    expect(f.store.getAll()).toMatchObject([{ idempotencyKey: id(10), attempted: true }]);
    f.sender.send.mockResolvedValueOnce(accepted(record(), 'duplicate'));
    await f.outbox.retryAll();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(f.store.getAll()).toEqual([]);
  });

  it('isolates two accounts on one device and refuses a mismatched actor', () => {
    const f = fixture();
    f.outbox.enqueue(record());
    const other = new NativePendingLogStore(f.storage, id(9));
    expect(other.getAll()).toEqual([]);
    expect(() => other.save(record())).toThrow('Account changed');
    other.save({ ...record(11), actorUserId: id(9) });
    expect(f.store.getAll().map((entry) => entry.idempotencyKey)).toEqual([id(10)]);
  });

  it('does not send, confirm or enqueue after sign-out', async () => {
    const f = fixture();
    f.outbox.enqueue(record());
    f.signOut();
    await f.outbox.retryAll();
    expect(await f.outbox.confirm(id(10))).toBe('inactive');
    expect(() => f.outbox.enqueue(record(11))).toThrow('Account changed');
    expect(f.sender.send).not.toHaveBeenCalled();
  });

  it('ignores an in-flight response after account change and leaves it for the original actor to reconcile', async () => {
    const f = fixture();
    f.outbox.enqueue(record());
    f.outbox.enqueue(record(11));
    const request = deferred<ReturnType<typeof accepted>>();
    f.sender.send.mockReturnValueOnce(request.promise);
    const replay = f.outbox.retryAll();
    f.signOut();
    request.resolve(accepted(record()));
    await replay;
    expect(f.sender.send).toHaveBeenCalledTimes(1);
    expect(f.changed).not.toHaveBeenCalledWith(true);
    expect(f.store.getAll()).toHaveLength(2);
    expect(new NativePendingLogStore(f.storage, id(9)).getAll()).toEqual([]);
  });

  it('never reactivates an old coordinator after sign-out and signing in again', async () => {
    const f = fixture();
    f.outbox.enqueue(record());
    f.outbox.dispose();
    await f.outbox.retryAll();
    expect(f.sender.send).not.toHaveBeenCalled();
    await new NativeLogOutbox(f.store, f.sender).retryAll();
    expect(f.store.getAll()).toEqual([]);
  });

  it('requires separate acknowledgment when replay discovers an additional warning', async () => {
    const f = fixture();
    const send = vi
      .fn<(...args: [NativePendingLog]) => Promise<DrinkLogResult>>()
      .mockResolvedValueOnce({
        status: 'confirmation_required',
        warnings: ['plan_exceeded'],
        message: 'Beyond plan.',
      })
      .mockResolvedValueOnce({
        status: 'confirmation_required',
        warnings: ['after_end'],
        message: 'After end.',
      })
      .mockResolvedValueOnce(accepted(record()) as DrinkLogResult);
    const outbox = new NativeLogOutbox(f.store, { ...f.sender, send });
    outbox.enqueue(record());
    await outbox.retryAll();
    await outbox.retryAll();
    expect(send).toHaveBeenCalledTimes(1);
    expect(await outbox.confirm(id(10))).toBe('needs_confirmation');
    await outbox.confirm(id(10));
    expect(send.mock.calls[2]?.[0]).toMatchObject({
      acknowledgePlanExceeded: true,
      acknowledgeAfterEnd: true,
      consumedAt: time,
      idempotencyKey: id(10),
    });
  });

  it.each(['after_actual_end', 'post_end_grace_expired', 'permission_denied', 'bottle_empty'])(
    'keeps permanent rejection %s visible without automatically retrying it',
    async (code) => {
      const f = fixture();
      const sender = {
        ...f.sender,
        send: vi.fn().mockResolvedValue({
          status: 'permanently_rejected',
          code,
          message: 'Cannot save this entry.',
        }),
      };
      const outbox = new NativeLogOutbox(f.store, sender);
      outbox.enqueue(record());
      await outbox.retryAll();
      await outbox.retryAll();
      expect(sender.send).toHaveBeenCalledTimes(1);
      expect(f.store.getAll()).toMatchObject([
        { status: 'permanent_failure', lastError: 'Cannot save this entry.' },
      ]);
    },
  );

  it('removes an unattempted entry offline without ever sending it', async () => {
    const f = fixture();
    f.outbox.enqueue(record());
    await f.outbox.remove(id(10));
    expect(f.sender.send).not.toHaveBeenCalled();
    expect(f.store.getAll()).toEqual([]);
  });

  it('checks and undoes an ambiguous chaser save before removing its local record', async () => {
    const f = fixture();
    const water = record(10, 'water');
    f.outbox.enqueue(water);
    f.sender.send.mockRejectedValueOnce(new Error('Response lost'));
    await f.outbox.syncOne(id(10));
    f.sender.send.mockResolvedValueOnce(accepted(water, 'duplicate'));
    await f.outbox.remove(id(10));
    expect(f.sender.delete).toHaveBeenCalledWith(id(50), 'water');
    expect(f.store.getAll()).toEqual([]);
  });

  it('keeps an ambiguous entry when removal cannot check the server', async () => {
    const f = fixture();
    f.store.save({ ...record(), attempted: true, status: 'failed' });
    f.sender.send.mockRejectedValueOnce(new Error('Offline'));
    await expect(f.outbox.remove(id(10))).rejects.toThrow('Offline');
    expect(f.store.getAll()).toHaveLength(1);
    expect(f.sender.delete).not.toHaveBeenCalled();
  });

  it('retains the original record if server undo fails', async () => {
    const f = fixture();
    f.store.save({ ...record(), attempted: true, status: 'failed' });
    f.sender.delete.mockRejectedValueOnce(new Error('Night ended'));
    await expect(f.outbox.remove(id(10))).rejects.toThrow('Night ended');
    expect(f.store.getAll()).toHaveLength(1);
  });
});

describe('offline warnings and reconciliation', () => {
  it('includes pending drinks in plan warnings and holds them until acknowledgment', async () => {
    const f = fixture();
    const entries = [record(), record(11)];
    const third = makePendingLog(snapshot(), id(2), { planItemId: id(4) }, entries, id(12), time);
    expect(third).toMatchObject({
      status: 'needs_confirmation',
      requiredWarnings: ['plan_exceeded'],
    });
    f.outbox.enqueue(third);
    await f.outbox.retryAll();
    expect(f.sender.send).not.toHaveBeenCalled();
    await f.outbox.confirm(id(12));
    expect(f.sender.send).toHaveBeenCalledWith(
      expect.objectContaining({ acknowledgePlanExceeded: true }),
    );
  });

  it('requires the planned-end warning offline; chasers have no alcohol warning', () => {
    const night = snapshot();
    night.night.endsAt = '2026-10-03T17:59:00.000Z';
    expect(makePendingLog(night, id(2), { planItemId: id(4) }, [], id(10), time)).toMatchObject({
      requiredWarnings: ['after_end'],
      acknowledgeAfterEnd: false,
    });
    expect(makePendingLog(night, id(2), 'water', [], id(11), time)).toMatchObject({
      status: 'pending',
    });
  });

  it('does not double count canonical keys, including deleted logs or another actor', () => {
    const night = snapshot();
    const result = accepted(record()) as Extract<DrinkLogResult, { status: 'created' }>;
    const member = night.members[0];
    if (!member) throw new Error('Missing test participant');
    member.drinkLogs = [{ ...result.log, deletedAt: time }];
    const entries = [record(), record(11), { ...record(12), actorUserId: id(9) }];
    expect(pendingForSnapshot(night, entries).map((entry) => entry.idempotencyKey)).toEqual([
      id(11),
    ]);
    expect(makePendingLog(night, id(2), { planItemId: id(4) }, entries, id(13), time).status).toBe(
      'pending',
    );
  });
});

describe('native outbox API boundary', () => {
  it('pins the original actor token even if shared authentication changes before fetch starts', async () => {
    const authentication = deferred<string | null>();
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(
        new Response(JSON.stringify(accepted(record())), {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const client = createClient<Database>('https://test.supabase.co', 'sb_publishable_test', {
      accessToken: () => authentication.promise,
      global: { fetch },
    });
    let session = { actorUserId: owner, accessToken: 'original-actor-token' };
    const sender = nativeLogSender(
      client,
      () => true,
      () => true,
      () => session,
    );
    const sending = sender.send(record());
    session = { actorUserId: id(9), accessToken: 'next-actor-token' };
    authentication.resolve('next-actor-token');
    await sending;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe(
      'Bearer original-actor-token',
    );
    expect(() => sender.send(record())).toThrow('Account changed');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('uses the existing RPCs with the original keys, timestamps, actor target, serving and acknowledgments', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: accepted(record()), error: null });
    const sender = nativeLogSender({ rpc } as unknown as SupabaseClient<Database>, () => true);
    await sender.send({ ...record(), acknowledgePlanExceeded: true });
    expect(rpc).toHaveBeenLastCalledWith('log_drink', {
      p_target_member_id: id(2),
      p_plan_item_id: id(4),
      p_consumed_at: time,
      p_idempotency_key: id(10),
      p_ack_plan_exceeded: true,
      p_ack_after_end: false,
    });
    await sender.send(record(11, 'water'));
    expect(rpc).toHaveBeenLastCalledWith('log_water', {
      p_target_member_id: id(2),
      p_consumed_at: time,
      p_idempotency_key: id(11),
    });
    await sender.send(record(12, { customDrink: { ...drink, sharedBottleId: id(70) } }));
    expect(rpc).toHaveBeenLastCalledWith(
      'log_drink',
      expect.objectContaining({
        p_custom_drink: {
          label: 'Beer',
          category: 'beer',
          volume_ml: 330,
          abv_percent: 5,
          shared_bottle_id: id(70),
        },
        p_idempotency_key: id(12),
        p_consumed_at: time,
      }),
    );
  });

  it('blocks network operations after account change or while backgrounded', async () => {
    const rpc = vi.fn();
    const client = { rpc } as unknown as SupabaseClient<Database>;
    await expect(nativeLogSender(client, () => false).send(record())).rejects.toThrow(
      'Account changed',
    );
    await expect(
      nativeLogSender(
        client,
        () => true,
        () => false,
      ).send(record()),
    ).rejects.toThrow('background');
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('offline cache boundaries', () => {
  it('allows offline profile restoration only for a previously verified actor and invalidates explicit denial', () => {
    const storage = device();
    const offline = new Error('Network request failed');
    expect(resolveProfileRead(storage, owner, false, offline)).toBe('error');
    expect(resolveProfileRead(storage, owner, true, null)).toBe('complete');
    expect(resolveProfileRead(storage, owner, false, offline)).toBe('complete');
    expect(resolveProfileRead(storage, id(9), false, offline)).toBe('error');
    expect(resolveProfileRead(storage, owner, false, { code: '42501', message: 'Denied' })).toBe(
      'error',
    );
    expect(resolveProfileRead(storage, owner, false, offline)).toBe('error');
    expect(resolveProfileRead(storage, owner, true, null)).toBe('complete');
    expect(resolveProfileRead(storage, owner, false, null)).toBe('incomplete');
    expect(resolveProfileRead(storage, owner, false, offline)).toBe('error');
  });

  it('restores only the matching actor and scope and clears a denied snapshot', () => {
    const storage = device();
    writeOfflineCache(storage, owner, 'night', snapshot());
    expect(readOfflineCache(storage, owner, 'night')).toEqual(snapshot());
    expect(readOfflineCache(storage, id(9), 'night')).toBeNull();
    expect(readOfflineCache(storage, owner, 'summary')).toBeNull();
    clearOfflineCache(storage, owner, 'night');
    expect(readOfflineCache(storage, owner, 'night')).toBeNull();
  });

  it('recognizes transport failures without treating authentication and authorization denials as offline', () => {
    expect(isConnectionFailure({ message: 'TypeError: Network request failed', code: '' })).toBe(
      true,
    );
    expect(isConnectionFailure({ message: 'Failed to fetch' })).toBe(true);
    expect(isConnectionFailure({ name: 'AuthRetryableFetchError' })).toBe(true);
    expect(isConnectionFailure({ message: 'Permission denied', code: '42501' })).toBe(false);
    expect(isConnectionFailure({ message: 'Network timeout', status: 401 })).toBe(false);
  });
});
