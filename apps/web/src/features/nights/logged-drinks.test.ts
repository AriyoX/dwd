import { describe, expect, it } from 'vitest';
import { calculateMemberTotals, projectedPlanStatus } from '@dwd/core';
import type { PendingDrinkLog } from '@dwd/contracts';
import { createTourNight } from '../tour/sample-state';
import { withPendingDrinks } from './logged-drinks';

const member = createTourNight().members[0];
if (!member) throw new Error('Missing fixture member');
const pending: PendingDrinkLog = {
  idempotencyKey: 'queued',
  kind: 'alcohol',
  actorUserId: 'user',
  nightId: member.nightId,
  nightMemberId: member.id,
  memberDisplayName: member.displayName,
  drinkSnapshot: { label: 'Strong beer', category: 'beer', volumeMl: 500, abvPercent: 8 },
  consumedAt: new Date().toISOString(),
  createdLocallyAt: new Date().toISOString(),
  status: 'pending',
  retryCount: 0,
  acknowledgeAfterEnd: false,
  acknowledgePlanExceeded: false,
};

describe('optimistic alcohol totals', () => {
  it('includes volume and strength of queued drinks in totals and confirmations', () => {
    const logs = withPendingDrinks(member, [pending]);
    expect(calculateMemberTotals(logs).ethanolGrams).toBe(44.579);
    expect(projectedPlanStatus(logs, member.planItems, 13.019)).toBe('exceeded');
  });
  it('does not double count retries or already-saved entries', () => {
    expect(withPendingDrinks(member, [pending, pending])).toHaveLength(2);
    expect(
      withPendingDrinks(member, [
        { ...pending, idempotencyKey: member.drinkLogs[0]?.idempotencyKey ?? '' },
      ]),
    ).toHaveLength(1);
  });
  it('excludes rejected, unconfirmed, water and another member’s entries', () => {
    expect(
      withPendingDrinks(member, [
        { ...pending, status: 'permanent_failure' },
        { ...pending, status: 'needs_confirmation' },
        { ...pending, kind: 'water' },
        { ...pending, nightMemberId: 'other' },
      ]),
    ).toEqual(member.drinkLogs);
  });
});
