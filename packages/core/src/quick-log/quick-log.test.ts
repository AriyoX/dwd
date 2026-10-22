import { describe, expect, it } from 'vitest';
import {
  emptyQuickRecord,
  hasQuickLogs,
  hasUnknownAmounts,
  parseQuickRecord,
  quickCountLabel,
  quickCounts,
  quickSessionForNight,
  type QuickSession,
} from './quick-log';
let nextId = 0;
const randomUUID = () => `fc100000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`;

describe('returning from a planned night', () => {
  function session(nightId: string, memberId: string, updatedAt: string): QuickSession {
    const id = randomUUID();
    return {
      id,
      schemaVersion: 3,
      scope: 'guest',
      claimedBy: null,
      createdAt: updatedAt,
      updatedAt,
      finishedAt: null,
      state: 'active',
      entries: [
        {
          id: randomUUID(),
          sessionId: id,
          kind: 'drink',
          recordedAt: updatedAt,
          updatedAt,
          sequence: 1,
          revision: 1,
          removedAt: null,
          destination: { nightId, memberId, entryId: randomUUID(), operationId: randomUUID() },
        },
      ],
    };
  }
  it('finds the matching session instead of a newer unrelated night or membership', () => {
    const linked = session('night', 'self', '2026-10-21T18:00:00Z');
    const sessions = [
      linked,
      session('other', 'self', '2026-10-21T19:00:00Z'),
      session('night', 'other', '2026-10-21T20:00:00Z'),
    ];
    const before = structuredClone(sessions);
    expect(quickSessionForNight(sessions, 'night', 'self')).toBe(linked);
    expect(quickSessionForNight(sessions, 'missing', 'self')).toBeUndefined();
    expect(sessions).toEqual(before);
  });
  it('prefers a still-active matching session over finished history', () => {
    const active = session('night', 'self', '2026-10-21T18:00:00Z');
    const finished = {
      ...session('night', 'self', '2026-10-21T19:00:00Z'),
      state: 'finished' as const,
    };
    expect(quickSessionForNight([finished, active], 'night', 'self')).toBe(active);
    expect(quickSessionForNight([finished], 'night', 'self')).toBe(finished);
  });
});

describe('drink and chaser meaning', () => {
  it('counts legacy shots as drinks and excludes removed entries', () => {
    const entries = [
      { kind: 'drink' },
      { kind: 'shot' },
      { kind: 'chaser' },
      { kind: 'chaser', removedAt: '2026-10-14T00:00:00Z' },
    ] as const;
    expect(quickCounts(entries)).toEqual({ drink: 2, chaser: 1 });
    expect(quickCountLabel(entries)).toBe('2 drinks · 1 chaser');
  });
  it('shows a chaser-only night without marking alcohol subtotals incomplete', () => {
    const entries = [{ kind: 'chaser' as const, deletedAt: null }];
    expect(hasQuickLogs(entries)).toBe(true);
    expect(hasUnknownAmounts(entries)).toBe(false);
    expect(hasUnknownAmounts([...entries, { kind: 'shot', deletedAt: null }])).toBe(true);
    expect(hasUnknownAmounts([{ kind: 'drink', deletedAt: '2026-10-14T00:00:00Z' }])).toBe(false);
  });
  it('upgrades v2 without changing a pending import or its undo provenance', () => {
    const sessionId = randomUUID(),
      entryId = randomUUID();
    const recordedAt = '2026-10-14T00:00:00Z';
    const entry = { id: entryId, sessionId, kind: 'shot', recordedAt, sequence: 1, revision: 1 };
    const operation = {
      id: randomUUID(),
      sessionId,
      accountId: randomUUID(),
      nightId: randomUUID(),
      memberId: randomUUID(),
      createdAt: recordedAt,
      entries: [entry],
      state: 'uncertain',
      receipt: null,
    };
    const old = {
      ...emptyQuickRecord('guest'),
      version: 2,
      activeSessionId: sessionId,
      sessions: [
        {
          id: sessionId,
          schemaVersion: 2,
          scope: 'guest',
          createdAt: recordedAt,
          updatedAt: recordedAt,
          finishedAt: null,
          state: 'active',
          entries: [{ ...entry, updatedAt: recordedAt, removedAt: null, destination: null }],
        },
      ],
      operations: [operation],
      undo: { entryId, sessionId, revision: 1, previous: { kind: 'drink', removedAt: null } },
    };
    const upgraded = parseQuickRecord(JSON.stringify(old), 'guest');
    expect(upgraded.version).toBe(3);
    expect(upgraded.operations[0]).toEqual(operation);
    expect(upgraded.undo).toEqual(old.undo);
    expect(upgraded.sessions[0]?.entries[0]?.kind).toBe('shot');
    expect(quickCountLabel(upgraded.sessions[0]?.entries ?? [])).toBe('1 drink · 0 chasers');
  });
});
