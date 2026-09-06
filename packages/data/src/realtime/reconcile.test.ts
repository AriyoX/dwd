import { describe, expect, it } from 'vitest';
import { reconcileAlcoholLogs, type OptimisticAlcoholLog } from './reconcile';
import type { AlcoholLog } from '@dwd/core';

describe('optimistic reconciliation', () => {
  it('merges optimistic and realtime copies by idempotency key', () => {
    const canonical = [drink('same')];
    const optimistic = [optimisticDrink('same'), optimisticDrink('pending')];
    expect(reconcileAlcoholLogs(canonical, optimistic).map((log) => log.idempotencyKey)).toEqual([
      'same',
      'pending',
    ]);
  });
});

function optimisticDrink(idempotencyKey: string): OptimisticAlcoholLog {
  return {
    idempotencyKey,
    ethanolGrams: 13,
    consumedAt: '2026-07-31T20:00:00Z',
    labelSnapshot: 'Beer',
    nightMemberId: 'member',
  };
}

function drink(idempotencyKey: string): AlcoholLog {
  return {
    id: 'log',
    nightId: 'night',
    nightMemberId: 'member',
    actorUserId: 'user',
    planItemId: null,
    labelSnapshot: 'Beer',
    categorySnapshot: 'beer',
    volumeMl: 330,
    abvPercent: 5,
    ethanolGrams: 13,
    consumedAt: '2026-07-31T20:00:00Z',
    createdAt: '2026-07-31T20:00:01Z',
    afterEnd: false,
    idempotencyKey,
    deletedAt: null,
  };
}
