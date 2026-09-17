import { describe, expect, it } from 'vitest';
import { addTourDrink, createTourNight } from '../tour/sample-state';
import { memberNotices } from './member-notices';

const now = new Date('2026-09-17T20:00:00Z');
const snapshot = addTourDrink(
  createTourNight(now.getTime()),
  'alcohol',
  undefined,
  undefined,
  now.getTime(),
);
const member = snapshot.members[0];
if (!member) throw new Error('Missing fixture member');

describe('personal notices', () => {
  it('calculates current pace even when no server alert was delivered', () => {
    expect(snapshot.alerts).toEqual([]);
    expect(memberNotices(member, member.drinkLogs, now).map((alert) => alert.type)).toEqual([
      'personal_pace',
    ]);
  });
  it('uses stable notice identities through polling and clears after an undo', () => {
    expect(memberNotices(member, member.drinkLogs, new Date(now.getTime() + 1000))).toEqual(
      memberNotices(member, member.drinkLogs, now),
    );
    const corrected = member.drinkLogs.map((log, index) =>
      index === 1 ? { ...log, deletedAt: now.toISOString() } : log,
    );
    expect(memberNotices(member, corrected, now)).toEqual([]);
  });
  it('compares alcohol content rather than container count with the plan', () => {
    const strong = member.drinkLogs.map((log) => ({ ...log, ethanolGrams: 30 }));
    expect(
      memberNotices(member, strong, now).find((alert) => alert.type === 'plan_reached')?.message,
    ).toContain('over your plan');
  });
  it('never counts another member’s entries', () => {
    expect(
      memberNotices(
        member,
        member.drinkLogs.map((log) => ({ ...log, nightMemberId: 'other' })),
        now,
      ),
    ).toEqual([]);
  });
});
