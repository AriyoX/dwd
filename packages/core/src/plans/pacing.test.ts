import { describe, expect, it } from 'vitest';
import { calculatePlanPacing } from './pacing';
import { calculateEthanolGrams } from '../alcohol/calculations';
import type { PlanItemInput } from '../types/domain';
import type { RollingLogValue } from '../warnings/warnings';

const plan: PlanItemInput[] = [
  {
    label: 'Beer',
    category: 'beer',
    volumeMl: 330,
    abvPercent: 5,
    plannedQuantity: 4,
    isQuickLog: true,
  },
];
const at = (hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 8, 17, hour, minute)).toISOString();
const grams = calculateEthanolGrams(330, 5);
const log = (hour: number, amount = grams): RollingLogValue => ({
  nightMemberId: 'member',
  ethanolGrams: amount,
  consumedAt: at(hour),
  deletedAt: null,
});
const pace = (logs: RollingLogValue[] = [], now = at(18)) =>
  calculatePlanPacing(plan, logs, 'member', at(18), at(22), now);

describe('plan pacing', () => {
  it('spreads the alcohol budget over the planned duration', () => {
    expect(pace()).toEqual({ intervalMinutes: 60, waitMinutes: 0, status: 'spacing' });
  });
  it('keeps a full interval after a late start instead of encouraging catch-up', () => {
    expect(pace([log(20)], at(20, 30))?.waitMinutes).toBe(30);
  });
  it('weights stronger drinks by alcohol content and prompts a pause', () => {
    expect(pace([log(19, grams * 2)], at(19, 30))).toMatchObject({
      waitMinutes: 90,
      status: 'pause',
    });
  });
  it('ignores deleted, future, water and other-member entries', () => {
    expect(
      pace([
        { ...log(18), deletedAt: at(18) },
        log(21),
        { ...log(18), kind: 'water' },
        { ...log(18), nightMemberId: 'other' },
      ]),
    ).toEqual(pace());
  });
  it('does not suggest finishing drinks after the plan or time ends', () => {
    expect(pace([log(18, grams * 4)])?.status).toBe('finished');
    expect(pace([], at(22))?.status).toBe('finished');
    expect(pace([log(21)], at(21, 30))?.status).toBe('pause');
  });
  it('does not recommend a rapid rate for a dense plan', () => {
    expect(calculatePlanPacing(plan, [], 'member', at(18), at(19), at(18))?.status).toBe('packed');
  });
  it('handles water-only plans and invalid time ranges', () => {
    expect(calculatePlanPacing([], [], 'member', at(18), at(22), at(18))).toBeNull();
    expect(calculatePlanPacing(plan, [], 'member', at(22), at(18), at(18))).toBeNull();
  });
  it('does not invent a wait for the first drink when the server clock is ahead', () => {
    expect(pace([], at(17, 59))?.waitMinutes).toBe(0);
  });
});
