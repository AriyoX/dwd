import { describe, expect, it } from 'vitest';
import { buildBottlePlan, bottlePlanProgress } from './bottles';
import { sharedBottleInputSchema, planItemsSchema, customDrinkSchema } from '../schemas/schemas';
import { calculatePlanTotal } from '../plans/plans';
import type { AlcoholLog, PlanItemInput, SharedBottle } from '../types/domain';

const bottle: SharedBottle = {
  id: 'a1000000-0000-4000-8000-000000000001',
  nightId: 'a1000000-0000-4000-8000-000000000002',
  creatorMemberId: null,
  label: 'Shared gin',
  category: 'spirit',
  volumeMl: 750,
  abvPercent: 40,
  pourMl: 30,
  access: 'everyone',
  allowedMemberIds: [],
  joinedMemberIds: [],
  remainingMl: 750,
  closedAt: null,
};
const beer: PlanItemInput = {
  label: 'Beer',
  category: 'beer',
  volumeMl: 330,
  abvPercent: 5,
  plannedQuantity: 2,
  isQuickLog: true,
};

describe('shared bottle plans', () => {
  it('plans individual pours, not the whole bottle, and retains its source through validation', () => {
    const plan = planItemsSchema.parse(buildBottlePlan([], bottle, 2, 'add'));
    expect(plan[0]).toMatchObject({
      sharedBottleId: bottle.id,
      volumeMl: 30,
      plannedQuantity: 2,
      isQuickLog: true,
    });
    expect(calculatePlanTotal(plan)).toBe(18.936);
    expect(customDrinkSchema.parse(plan[0]).sharedBottleId).toBe(bottle.id);
  });
  it('makes a new bottle the main drink and keeps other drinks', () => {
    const plan = buildBottlePlan([beer], bottle, 2, 'add');
    expect(plan[0]).toEqual({ ...beer, isQuickLog: false });
    expect(plan[1]?.isQuickLog).toBe(true);
    expect(planItemsSchema.safeParse(plan).success).toBe(true);
  });
  it('updates existing pours instead of duplicating the bottle', () => {
    const first = buildBottlePlan([beer], bottle, 2, 'add');
    const next = buildBottlePlan(first, bottle, 3, 'add', 25);
    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({ volumeMl: 25, plannedQuantity: 3, isQuickLog: true });
    expect(first[1]?.plannedQuantity).toBe(2);
  });
  it('replaces planned drinks only when requested', () => {
    const next = buildBottlePlan([beer], bottle, 2, 'replace');
    expect(next).toHaveLength(1);
    expect(next[0]?.isQuickLog).toBe(true);
  });
  it('rejects invalid bottle details and pours larger than the bottle', () => {
    expect(sharedBottleInputSchema.safeParse({ ...bottle, pourMl: 800 }).success).toBe(false);
    expect(sharedBottleInputSchema.safeParse({ ...bottle, abvPercent: NaN }).success).toBe(false);
    expect(sharedBottleInputSchema.safeParse({ ...bottle, volumeMl: -1 }).success).toBe(false);
    expect(sharedBottleInputSchema.safeParse({ ...bottle, label: '  ' }).success).toBe(false);
    expect(sharedBottleInputSchema.safeParse({ ...bottle, defaultQuantity: 0 }).success).toBe(
      false,
    );
    expect(sharedBottleInputSchema.parse(bottle).defaultQuantity).toBe(1);
  });
  it('lets an adjustment keep the chosen main drink', () => {
    const plan = buildBottlePlan([beer], bottle, 3, 'add', 25, false);
    expect(plan[0]).toEqual(beer);
    expect(plan[1]?.isQuickLog).toBe(false);
  });
  it('counts personal progress by bottle across plan edits, sizes and undo', () => {
    const logs = [
      { sharedBottleId: bottle.id, volumeMl: 30, deletedAt: null },
      { sharedBottleId: bottle.id, volumeMl: 15, deletedAt: null },
      { sharedBottleId: bottle.id, volumeMl: 30, deletedAt: '2026-09-29T12:00:00Z' },
      { sharedBottleId: 'another-bottle', volumeMl: 30, deletedAt: null },
    ] as AlcoholLog[];
    expect(bottlePlanProgress(bottle.id, logs, 30)).toBe(1.5);
    expect(bottlePlanProgress(bottle.id, logs, 15)).toBe(3);
  });
});
