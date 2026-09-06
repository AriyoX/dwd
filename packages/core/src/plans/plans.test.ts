import { describe, expect, it } from 'vitest';
import { calculatePlanTotal, determinePlanStatus, projectedPlanStatus } from './plans';
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
