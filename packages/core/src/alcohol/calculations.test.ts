import { describe, expect, it } from 'vitest';
import {
  calculateEthanolGrams,
  calculateMemberTotals,
  calculateStandardDrinkEquivalent,
} from './calculations';
import type { AlcoholLog, WaterLog } from '../types/domain';

describe('alcohol calculations', () => {
  it.each([
    [330, 5, 13.019],
    [500, 5, 19.725],
    [150, 12, 14.202],
    [40, 40, 12.624],
    [250, 8, 15.78],
  ])('calculates %i ml at %i%% ABV', (volume, abv, expected) => {
    expect(calculateEthanolGrams(volume, abv)).toBe(expected);
  });

  it.each([
    [0, 5],
    [-1, 5],
    [330, 0],
    [330, -1],
    [2_001, 5],
    [330, 96],
  ])('rejects invalid values', (volume, abv) => {
    expect(() => calculateEthanolGrams(volume, abv)).toThrow(RangeError);
  });

  it('rounds canonical ethanol to three decimals and equivalents to two', () => {
    expect(calculateEthanolGrams(333, 4.7)).toBe(12.349);
    expect(calculateStandardDrinkEquivalent(12.346)).toBe(1.23);
  });

  it('ignores deleted alcohol and never subtracts water', () => {
    const logs = [makeDrink('1', 13.019), makeDrink('2', 12.624, '2026-07-31T20:10:00Z')];
    const waters = [makeWater('w1')];
    expect(calculateMemberTotals(logs, waters)).toMatchObject({
      alcoholCount: 1,
      waterCount: 1,
      ethanolGrams: 13.019,
    });
  });
});

function makeDrink(id: string, grams: number, deletedAt: string | null = null): AlcoholLog {
  return {
    id,
    nightId: 'night',
    nightMemberId: 'member',
    actorUserId: 'user',
    planItemId: null,
    labelSnapshot: 'Beer',
    categorySnapshot: 'beer',
    volumeMl: 330,
    abvPercent: 5,
    ethanolGrams: grams,
    consumedAt: '2026-07-31T20:00:00Z',
    createdAt: '2026-07-31T20:00:01Z',
    afterEnd: false,
    idempotencyKey: id,
    deletedAt,
  };
}

function makeWater(id: string): WaterLog {
  return {
    id,
    nightId: 'night',
    nightMemberId: 'member',
    actorUserId: 'user',
    consumedAt: '2026-07-31T20:00:00Z',
    createdAt: '2026-07-31T20:00:01Z',
    idempotencyKey: id,
    deletedAt: null,
  };
}
