import { describe, it, expect, vi } from 'vitest';
import {
  quickScope,
  quickSyncFingerprint,
  availableQuickEntries,
  type QuickSession,
} from '@dwd/core';
import { QuickLogStore } from '../storage/quick-log-store';
import { associateGuestQuickLogs, synchronizeQuickLogs } from './quick-sync';

const owner = 'af100000-0000-4000-8000-000000000001',
  other = 'af100000-0000-4000-8000-000000000002';
function fixture() {
  let id = 0,
    failAccount = false;
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (failAccount && key.includes('account:')) throw new Error('Quota');
      values.set(key, value);
    },
  };
  const uuid = () => `af200000-0000-4000-8000-${(++id).toString().padStart(12, '0')}`;
  const guest = new QuickLogStore(storage, 'guest', uuid),
    account = new QuickLogStore(storage, quickScope(owner), uuid);
  guest.hydrate();
  account.hydrate();
  guest.acknowledgeEligibility();
  const saved = new Map<string, QuickSession>();
  const save = vi.fn((session: QuickSession, entries: QuickSession['entries']) => {
    const previous = saved.get(session.id);
    const byId = new Map((previous?.entries ?? []).map((e) => [e.id, e]));
    for (const entry of entries) byId.set(entry.id, entry);
    const next = { ...session, entries: [...byId.values()] };
    saved.set(session.id, next);
    return Promise.resolve(next);
  });
  const list = vi.fn(() => Promise.resolve([...saved.values()]));
  const mutate = (work: () => void) => {
    work();
    return Promise.resolve();
  };
  const run = (currentAccount = () => owner, online = true) =>
    synchronizeQuickLogs({
      guest,
      account,
      accountId: owner,
      currentAccount,
      online,
      mutate,
      save,
      list,
    });
  return {
    guest,
    account,
    run,
    save,
    list,
    saved,
    storage,
    uuid,
    values,
    fail: (value: boolean) => {
      failAccount = value;
    },
  };
}
describe('account Quick Log synchronization', () => {
  it('keeps an unresolved transfer revision frozen when account refresh sees a newer remote edit', async () => {
    const f = fixture();
    f.guest.log('drink');
    await f.run();
    const session = f.account.session();
    if (!session) throw new Error('Fixture');
    f.account.prepareTransfer(session.id, owner, f.uuid(), f.uuid());
    const remote = {
      ...session,
      entries: session.entries.map((e) => ({
        ...e,
        kind: 'chaser' as const,
        revision: e.revision + 1,
      })),
    };
    f.account.mergeAccountSession(remote);
    const restored = new QuickLogStore(f.storage, quickScope(owner), f.uuid);
    restored.hydrate();
    expect(restored.getSnapshot().blocked).toBe(false);
    expect(restored.session()?.entries[0]?.kind).toBe('drink');
    expect(restored.session()?.entries[0]?.revision).toBe(1);
  });
  it('associates all valid guest entries exactly once without creating a Night, preserving IDs, order, kinds, timestamps and Undo', async () => {
    const f = fixture();
    f.guest.log('drink');
    f.guest.log('shot');
    f.guest.log('chaser');
    const before = f.guest.session(),
      undo = f.guest.getSnapshot().record.undo;
    expect(before).toBeDefined();
    await f.run();
    await f.run();
    expect(f.account.session()?.id).toBe(before?.id);
    expect(f.account.session()?.entries).toEqual(before?.entries);
    expect(f.account.getSnapshot().record.undo).toEqual(undo);
    expect(f.saved.size).toBe(1);
    expect(f.save).toHaveBeenCalledOnce();
    expect(f.guest.getSnapshot().record.sessions[0]?.claimedBy).toBe(owner);
    expect(
      f.account.session()?.entries.every((e) => !('volumeMl' in e) && !('abvPercent' in e)),
    ).toBe(true);
  });
  it('keeps the original guest copy and bound owner after a partial local handoff, and retries safely after restart', async () => {
    const f = fixture();
    f.guest.log('drink');
    const id = f.guest.session()?.id;
    f.fail(true);
    await expect(f.run()).rejects.toThrow(/device copy/);
    expect(f.save).not.toHaveBeenCalled();
    expect(f.guest.session()?.entries).toHaveLength(1);
    f.fail(false);
    f.account.retrySave();
    await f.run();
    expect(f.account.session(id)?.entries).toHaveLength(1);
    expect(f.saved.size).toBe(1);
  });
  it('retains unsynced entries offline and after network failure; a lost server response reconciles on retry without duplicates', async () => {
    const f = fixture();
    f.guest.log('drink');
    f.guest.log('chaser');
    await f.run(() => owner, false);
    expect(f.save).not.toHaveBeenCalled();
    f.save.mockImplementationOnce((session) => {
      f.saved.set(session.id, session);
      return Promise.reject(new Error('Response lost'));
    });
    await expect(f.run()).rejects.toThrow('Response lost');
    expect(f.account.session()?.entries).toHaveLength(2);
    expect(f.account.getSnapshot().record.synced).toEqual({});
    await f.run();
    expect(f.saved.size).toBe(1);
    expect([...f.saved.values()][0]?.entries).toHaveLength(2);
  });
  it('does not attach a claimed guest session or an unresolved transfer to another account', async () => {
    const f = fixture();
    f.guest.log('drink');
    await f.run();
    const second = new QuickLogStore(f.storage, quickScope(other), f.uuid);
    second.hydrate();
    associateGuestQuickLogs(f.guest, second, other);
    expect(second.getSnapshot().record.sessions).toEqual([]);
    const g = fixture();
    g.guest.log('shot');
    const session = g.guest.session();
    if (!session) throw new Error('Fixture');
    g.guest.prepareTransfer(session.id, owner, f.uuid(), f.uuid());
    associateGuestQuickLogs(g.guest, second, other);
    expect(second.getSnapshot().record.sessions).toEqual([]);
  });
  it('stops when credentials change in flight and does not confirm backup', async () => {
    const f = fixture();
    f.guest.log('drink');
    let current = owner;
    f.save.mockImplementationOnce((session) => {
      current = other;
      return Promise.resolve(session);
    });
    await expect(f.run(() => current)).rejects.toThrow('account changed');
    expect(f.account.getSnapshot().record.synced).toEqual({});
    expect(f.account.session()?.entries).toHaveLength(1);
  });
  it('keeps taps made while saving and synchronizes them on the next request', async () => {
    const f = fixture();
    f.guest.log('drink');
    f.save.mockImplementationOnce((session) => {
      f.account.log('chaser');
      return Promise.resolve(session);
    });
    await f.run();
    const session = f.account.session();
    expect(session?.entries).toHaveLength(2);
    expect(f.account.getSnapshot().record.synced[session?.id ?? '']).not.toBe(
      session && quickSyncFingerprint(session),
    );
    await f.run();
    expect(f.saved.get(session?.id ?? '')?.entries).toHaveLength(2);
  });
  it('merges account history across devices without replacing local sessions or showing transferred entries twice', async () => {
    const f = fixture();
    f.guest.log('shot');
    await f.run();
    const source = f.account.session();
    if (!source) throw new Error('Fixture');
    const remote = {
      ...source,
      id: f.uuid(),
      state: 'finished' as const,
      finishedAt: source.updatedAt,
      entries: source.entries.map((e) => ({ ...e, id: f.uuid(), sessionId: '' })),
    };
    remote.entries = remote.entries.map((e) => ({ ...e, sessionId: remote.id }));
    f.saved.set(remote.id, remote);
    await f.run();
    expect(f.account.getSnapshot().record.sessions).toHaveLength(2);
    const operation = f.account.prepareTransfer(source.id, owner, f.uuid(), f.uuid());
    f.account.confirmTransfer(operation.id, {
      operationId: operation.id,
      accountId: owner,
      nightId: operation.nightId,
      memberId: operation.memberId,
      entries: operation.entries.map((e) => ({
        sourceEntryId: e.id,
        destinationEntryId: f.uuid(),
        revision: e.revision,
      })),
    });
    expect(availableQuickEntries(f.account.session(source.id))).toEqual([]);
  });
});
