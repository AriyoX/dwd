import { describe, expect, it } from 'vitest';
import { guestInputSchema, planItemsSchema, replacePlanSchema, startNightSchema } from './schemas';
const item = {
  label: 'Beer',
  category: 'beer',
  volumeMl: 330,
  abvPercent: 5,
  plannedQuantity: 2,
  isQuickLog: true,
};
describe('water-only validation', () => {
  it('permits an empty plan for hosts, invitees and tracked guests', () => {
    expect(planItemsSchema.safeParse([]).success).toBe(true);
    expect(guestInputSchema.safeParse({ displayName: 'Robin', planItems: [] }).success).toBe(true);
    expect(
      replacePlanSchema.safeParse({ memberId: '00000000-0000-4000-8000-000000000001', items: [] })
        .success,
    ).toBe(true);
    expect(
      startNightSchema.safeParse({
        creationKey: '00000000-0000-4000-8000-000000000001',
        title: 'Water night',
        endsAt: new Date(Date.now() + 3_600_000).toISOString(),
        timezone: 'UTC',
        withPeople: true,
        hostPlanItems: [],
        guests: [{ displayName: 'Robin', planItems: [] }],
      }).success,
    ).toBe(true);
  });
  it('keeps exactly one quick-log item and positive alcohol values for nonempty plans', () => {
    expect(planItemsSchema.safeParse([item]).success).toBe(true);
    expect(planItemsSchema.safeParse([{ ...item, isQuickLog: false }]).success).toBe(false);
    expect(planItemsSchema.safeParse([item, item]).success).toBe(false);
    expect(planItemsSchema.safeParse([{ ...item, abvPercent: 0 }]).success).toBe(false);
    expect(planItemsSchema.safeParse([{ ...item, plannedQuantity: 0 }]).success).toBe(false);
  });
});
