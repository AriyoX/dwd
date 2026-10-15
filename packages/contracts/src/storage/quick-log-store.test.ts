/* eslint-disable @typescript-eslint/no-non-null-assertion -- Fixtures assert the session created by the immediately preceding log. */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  availableQuickEntries,
  hasUnknownAmounts,
  isQuickSessionStale,
  parseQuickRecord,
  quickCounts,
  quickScope,
  quickRelativeTime,
  quickSyncFingerprint,
  type QuickScope,
} from '@dwd/core';
import { QuickLogStore, quickRecordKey } from './quick-log-store';

export function quickFixture(scope: QuickScope = 'guest', values = new Map<string, string>()) {
  let fail = false;
  let time = '2026-10-12T23:59:00.000Z';
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (fail) throw new Error('Quota exceeded');
      values.set(key, value);
    },
  };
  const store = new QuickLogStore(storage, scope, randomUUID, () => time);
  store.hydrate();
  return {
    store,
    values,
    storage,
    fail: (value: boolean) => {
      fail = value;
    },
    time: (value: string) => {
      time = value;
    },
    eligible: () => store.acknowledgeEligibility(),
  };
}
describe('device-only Quick Log', () => {
  it('orders concurrent positions consistently and treats equivalent timestamp formats as the same backup', () => {
    const f = quickFixture();
    f.eligible();
    f.store.log('drink');
    f.time('2026-10-13T00:00:00.000Z');
    f.store.log('chaser');
    const session = f.store.session()!;
    const tied = { ...session, entries: session.entries.map((e) => ({ ...e, sequence: 1 })) };
    expect(quickRelativeTime(tied, Date.parse('2026-10-13T00:01:00Z'))).toBe(
      'Last logged 1 min ago',
    );
    const alternate = {
      ...tied,
      createdAt: tied.createdAt.replace('.000Z', '+00:00'),
      entries: [...tied.entries]
        .reverse()
        .map((e) => ({ ...e, recordedAt: e.recordedAt.replace('.000Z', '+00:00') })),
    };
    expect(quickSyncFingerprint(alternate)).toBe(quickSyncFingerprint(tied));
  });
  it('advances lifecycle timestamps for rapid actions and a clock moving backwards', () => {
    const f = quickFixture();
    f.eligible();
    const { sessionId } = f.store.log('drink');
    const logged = f.store.session()!.updatedAt;
    f.store.finish(sessionId);
    const finished = f.store.session(sessionId)!.updatedAt;
    expect(Date.parse(finished)).toBeGreaterThan(Date.parse(logged));
    f.time('2026-10-12T23:58:00.000Z');
    f.store.reopen(sessionId);
    const reopened = f.store.session()!.updatedAt;
    expect(Date.parse(reopened)).toBeGreaterThan(Date.parse(finished));
    f.store.log('chaser');
    expect(Date.parse(f.store.session()!.updatedAt)).toBeGreaterThan(Date.parse(reopened));
    expect(f.store.session()!.entries[1]!.recordedAt).toBe('2026-10-12T23:58:00.000Z');
  });
  it('retains a failed deletion of the last session across reload and retry', () => {
    const f = quickFixture();
    f.eligible();
    const { sessionId } = f.store.log('drink');
    f.fail(true);
    f.store.deleteSession(sessionId);
    f.store.reload();
    expect(f.store.getSnapshot().record.sessions).toHaveLength(0);
    expect(f.store.getSnapshot().saved).toBe(false);
    f.fail(false);
    f.store.retrySave();
    expect(quickFixture('guest', f.values).store.getSnapshot().record.sessions).toHaveLength(0);
  });
  it('retains an unsaved age acknowledgement before the first log', () => {
    const f = quickFixture();
    f.fail(true);
    f.eligible();
    f.store.reload();
    expect(f.store.getSnapshot().record.eligible).toBe(true);
    expect(f.store.getSnapshot().saved).toBe(false);
  });
  it('restores exact Undo for a correction after a restart', () => {
    const f = quickFixture();
    f.eligible();
    const first = f.store.log('drink');
    f.store.correct(first.sessionId, first.entryId, 'chaser');
    const restored = quickFixture('guest', f.values).store;
    expect(restored.getSnapshot().record.undo?.entryId).toBe(first.entryId);
    restored.undo(restored.getSnapshot().record.undo!);
    expect(quickCounts(restored.session()!.entries)).toEqual({ drink: 1, chaser: 0 });
  });
  it('opens without creating a historical session or depending on auth, profile or network', () => {
    const f = quickFixture();
    expect(f.store.getSnapshot()).toMatchObject({
      hydrated: true,
      saved: false,
      record: { sessions: [], activeSessionId: null },
    });
    expect(f.values.size).toBe(0);
    f.eligible();
    f.store.log('drink');
    expect(quickCounts(f.store.session()!.entries)).toEqual({ drink: 1, chaser: 0 });
  });
  it('retains every rapid tap and exact Undo does not remove the latest different entry', () => {
    const f = quickFixture();
    f.eligible();
    const first = f.store.log('drink');
    for (let i = 0; i < 40; i++) f.store.log(i % 2 === 0 ? 'chaser' : 'drink');
    f.store.undo(first);
    const entries = f.store.session()!.entries;
    expect(quickCounts(entries)).toEqual({ drink: 20, chaser: 20 });
    expect(new Set(entries.map((e) => e.id)).size).toBe(41);
    expect(entries.at(-1)?.removedAt).toBeNull();
    expect(entries.map((e) => e.sequence)).toEqual(Array.from({ length: 41 }, (_, i) => i + 1));
  });
  it('corrects kind, removes and restores the precise revision across restarts', () => {
    const f = quickFixture();
    f.eligible();
    const original = f.store.log('drink');
    f.store.log('chaser');
    const changed = f.store.correct(original.sessionId, original.entryId, 'chaser');
    expect(quickCounts(f.store.session()!.entries)).toEqual({ drink: 0, chaser: 2 });
    expect(() => f.store.undo(original)).toThrow();
    f.store.undo(changed);
    const removed = f.store.correct(original.sessionId, original.entryId, 'remove');
    expect(quickCounts(f.store.session()!.entries)).toEqual({ drink: 0, chaser: 1 });
    f.store.undo(removed);
    const restored = quickFixture('guest', f.values).store;
    expect(quickCounts(restored.session()!.entries)).toEqual({ drink: 1, chaser: 1 });
    expect(restored.session()!.entries[0]?.revision).toBe(5);
  });
  it('keeps failed writes recoverable in memory and only says saved after retry succeeds', () => {
    const f = quickFixture();
    f.eligible();
    f.fail(true);
    f.store.log('drink');
    f.store.log('chaser');
    expect(f.store.getSnapshot()).toMatchObject({
      saved: false,
      issue: 'Couldn’t save on this device',
    });
    expect(quickCounts(f.store.session()!.entries)).toEqual({ drink: 1, chaser: 1 });
    f.fail(false);
    f.store.retrySave();
    expect(f.store.getSnapshot().saved).toBe(true);
    expect(quickCounts(quickFixture('guest', f.values).store.session()!.entries)).toEqual({
      drink: 1,
      chaser: 1,
    });
  });
  it('blocks unreadable and unsupported records without replacing the original data', () => {
    for (const raw of ['not JSON', '{"version":99,"history":"valuable"}']) {
      const values = new Map([[quickRecordKey('guest'), raw]]);
      const f = quickFixture('guest', values);
      expect(f.store.getSnapshot()).toMatchObject({
        blocked: true,
        recoveryRaw: raw,
        saved: false,
      });
      expect(() => f.eligible()).toThrow();
      f.store.retrySave();
      expect(values.get(quickRecordKey('guest'))).toBe(raw);
    }
  });
  it('migrates version 1 with stable IDs, original recording times and no invented amounts', () => {
    const id = randomUUID(),
      entryId = randomUUID();
    const legacy = {
      version: 1,
      scope: 'guest',
      activeSessionId: id,
      sessions: [
        {
          id,
          scope: 'guest',
          createdAt: '2026-10-12T23:00:00Z',
          updatedAt: '2026-10-12T23:01:00Z',
          finishedAt: null,
          state: 'active',
          entries: [
            {
              id: entryId,
              sessionId: id,
              kind: 'shot',
              recordedAt: '2026-10-12T23:01:00Z',
              sequence: 1,
            },
          ],
        },
      ],
    };
    const record = parseQuickRecord(JSON.stringify(legacy), 'guest');
    expect(record.version).toBe(3);
    expect(record.sessions[0]?.entries[0]).toMatchObject({
      id: entryId,
      recordedAt: '2026-10-12T23:01:00Z',
      revision: 1,
      destination: null,
    });
    expect(record.sessions[0]?.entries[0]).not.toHaveProperty('volumeMl');
  });
  it('continues after midnight and preserves ordering when the device clock moves backwards', () => {
    const f = quickFixture();
    f.eligible();
    f.store.log('drink');
    const id = f.store.session()!.id;
    f.time('2026-10-13T00:01:00Z');
    f.store.log('chaser');
    f.time('2026-10-12T22:00:00Z');
    f.store.log('drink');
    expect(f.store.session()!.id).toBe(id);
    expect(f.store.session()!.entries.map((e) => e.sequence)).toEqual([1, 2, 3]);
  });
  it('offers the 12-hour choice without expiration and keeps history after finish/start-new/reopen', () => {
    const f = quickFixture();
    f.eligible();
    f.store.log('chaser');
    const old = f.store.session()!;
    expect(isQuickSessionStale(old, Date.parse(old.updatedAt) + 12 * 3_600_000)).toBe(true);
    f.store.startNew();
    expect(f.store.getSnapshot().record.sessions).toHaveLength(1);
    expect(f.store.session()).toBeUndefined();
    expect(() => f.store.correct(old.id, old.entries[0]!.id, 'drink')).toThrow();
    f.store.reopen(old.id);
    expect(f.store.session()!.id).toBe(old.id);
    f.store.startNew();
    f.store.log('drink');
    expect(f.store.getSnapshot().record.sessions).toHaveLength(2);
    expect(() => f.store.reopen(old.id)).toThrow('Finish');
    f.store.deleteSession(old.id);
    expect(f.store.getSnapshot().record.sessions).toHaveLength(1);
  });
  it('isolates guest and accounts through sign-in, sign-out and account switching', () => {
    const values = new Map<string, string>();
    const a = quickScope(randomUUID()),
      b = quickScope(randomUUID());
    for (const [scope, kind] of [
      ['guest', 'chaser'],
      [a, 'drink'],
      [b, 'chaser'],
    ] as const) {
      const f = quickFixture(scope, values);
      f.eligible();
      f.store.log(kind);
    }
    expect(quickCounts(quickFixture(a, values).store.session()!.entries)).toEqual({
      drink: 1,
      chaser: 0,
    });
    expect(quickCounts(quickFixture(b, values).store.session()!.entries)).toEqual({
      drink: 0,
      chaser: 1,
    });
    expect(quickCounts(quickFixture('guest', values).store.session()!.entries)).toEqual({
      drink: 0,
      chaser: 1,
    });
  });
  it('detects a conflicting writer and retains both the durable original and recoverable memory', () => {
    const f = quickFixture();
    f.eligible();
    const other = quickFixture('guest', f.values);
    other.store.log('chaser');
    f.store.log('drink');
    expect(f.store.getSnapshot().saved).toBe(false);
    expect(quickCounts(f.store.session()!.entries)).toEqual({ drink: 1, chaser: 0 });
    expect(quickCounts(quickFixture('guest', f.values).store.session()!.entries)).toEqual({
      drink: 0,
      chaser: 1,
    });
  });
  it('represents unknown night measurements separately from measured dose', () => {
    expect(hasUnknownAmounts([{ deletedAt: null, kind: 'drink' }])).toBe(true);
    const f = quickFixture();
    f.eligible();
    f.store.log('drink');
    expect(availableQuickEntries(f.store.session())).toHaveLength(1);
  });
});
