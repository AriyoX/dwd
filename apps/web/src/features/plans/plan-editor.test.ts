import { describe, expect, it } from 'vitest';
import { materializePlanDraft, newPlanItem } from './plan-draft';

describe('plan draft materialization', () => {
  it('preserves a shared bottle when reviewing and saving a plan', () => {
    const sharedBottleId = 'a1000000-0000-4000-8000-000000000001';
    const result = materializePlanDraft('drinks', [
      {
        ...newPlanItem('shot'),
        label: 'Gin',
        category: 'spirit',
        volumeMl: '30',
        abvPercent: '40',
        plannedQuantity: '2',
        sharedBottleId,
      },
    ]);
    expect(result).toMatchObject({
      success: true,
      data: [{ sharedBottleId, volumeMl: 30, plannedQuantity: 2 }],
    });
  });
  it('starts a new row without choosing a drink', () => {
    const draft = newPlanItem();

    expect(draft.category).toBe('');
    expect(draft.label).toBe('');
    expect(draft.volumeMl).toBe('');
    expect(draft.abvPercent).toBe('');
    expect(materializePlanDraft('unselected', [])).toMatchObject({ success: false });
    expect(materializePlanDraft('drinks', [])).toMatchObject({ success: false });
  });

  it('only fills beer after an explicit preset choice', () => {
    const draft = newPlanItem('beer');

    expect(draft.category).toBe('beer');
    expect(draft.label).toBe('Beer');
    expect(materializePlanDraft('drinks', [draft])).toMatchObject({ success: true });
  });

  it('keeps custom rows independent from presets and rejects incomplete values', () => {
    const draft = newPlanItem();
    draft.category = 'other';

    expect(materializePlanDraft('drinks', [draft])).toMatchObject({ success: false });
    expect(materializePlanDraft('water_only', [])).toEqual({ success: true, data: [] });
  });
});
