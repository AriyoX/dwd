import { describe, expect, it } from 'vitest';
import {
  calculatePlanTotal,
  determinePlanStatus,
  projectedPlanStatus,
  validateProspectivePlan,
} from './plans';
import type { AlcoholLog, PlanItemInput } from '../types/domain';

const plan: PlanItemInput[] = [
  {
    label: 'Beer',
    category: 'beer',
    volumeMl: 330,
    abvPercent: 5,
    plannedQuantity: 2,
    isQuickLog: true,
  },
];
const beerPlan = plan[0];
if (beerPlan === undefined) throw new Error('Plan fixture is missing.');

describe('plan calculations', () => {
  it('sums intended ethanol across quantities', () => {
    expect(calculatePlanTotal(plan)).toBe(26.038);
  });

  it('distinguishes within, reached within tolerance, and exceeded', () => {
    expect(determinePlanStatus(20, 26)).toBe('within_plan');
    expect(determinePlanStatus(25.995, 26)).toBe('reached');
    expect(determinePlanStatus(26.02, 26)).toBe('exceeded');
  });

  it('does not require confirmation when a proposed log reaches the plan exactly', () => {
    const log = makeLog(13.019);
    expect(projectedPlanStatus([log], plan, 13.019)).toBe('reached');
  });

  it('requires exceeded status for planned or custom drinks above the plan', () => {
    expect(projectedPlanStatus([makeLog(13.019)], plan, 15)).toBe('exceeded');
  });

  it.each([
    ['no logged drinks', 0, 1, true],
    ['exactly one logged drink increased', 1, 6, true],
    ['two logged drinks increased', 2, 5, true],
    ['several logged drinks increased', 4, 6, true],
    ['several drinks reduced to a valid minimum', 4, 4, true],
    ['exactly one drink reduced below recorded activity', 1, 0, false],
    ['several drinks reduced below recorded activity', 4, 3, false],
  ])('%s', (_label, loggedCount, plannedQuantity, valid) => {
    const logs = Array.from({ length: loggedCount }, (_, index) => ({
      ...makeLog(13.019),
      id: `log-${index}`,
      idempotencyKey: `key-${index}`,
    }));
    expect(validateProspectivePlan([{ ...beerPlan, plannedQuantity }], logs).valid).toBe(valid);
  });

  it('ignores deleted historical activity when calculating the adjustment minimum', () => {
    expect(
      validateProspectivePlan(
        [{ ...beerPlan, plannedQuantity: 1 }],
        [{ ...makeLog(13.019), deletedAt: '2026-07-31T21:00:00Z' }],
      ).valid,
    ).toBe(true);
  });
});

function makeLog(ethanolGrams: number): AlcoholLog {
  return {
    id: 'log',
    nightId: 'night',
    nightMemberId: 'member',
    actorUserId: 'user',
    planItemId: 'plan',
    labelSnapshot: 'Beer',
    categorySnapshot: 'beer',
    volumeMl: 330,
    abvPercent: 5,
    ethanolGrams,
    consumedAt: '2026-07-31T20:00:00Z',
    createdAt: '2026-07-31T20:00:01Z',
    afterEnd: false,
    idempotencyKey: 'key',
    deletedAt: null,
  };
}
