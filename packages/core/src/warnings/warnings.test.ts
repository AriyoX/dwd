import { describe, expect, it } from 'vitest';
import {
  calculateRollingAlcoholTotal,
  confirmationMessage,
  determineGroupCheckInAlert,
  determinePersonalPaceAlert,
  isAlertInCooldown,
  isNightAlertRelevant,
  requiredLogConfirmations,
  requiredMemberLogConfirmations,
  shouldEmitRealtimePaceAlert,
  type RollingLogValue,
} from './warnings';
import type { MemberSnapshot } from '../types/domain';
import type { NightQuickLog } from '../quick-log/quick-log';

const asOf = '2026-07-31T22:00:00.000Z';

describe('planned drink confirmations with earlier Quick Log entries', () => {
  function member(kinds: NightQuickLog['kind'][]): Pick<MemberSnapshot, 'planItems' | 'quickLogs'> {
    return {
      planItems: [
        {
          id: 'plan',
          nightMemberId: 'member',
          createdBy: 'user',
          createdAt: asOf,
          updatedAt: asOf,
          archivedAt: null,
          label: 'Beer',
          category: 'beer',
          volumeMl: 330,
          abvPercent: 5,
          plannedQuantity: 2,
          isQuickLog: true,
        },
      ],
      quickLogs: kinds.map((kind, index) => ({
        id: `quick-${index}`,
        nightId: 'night',
        nightMemberId: 'member',
        actorUserId: 'user',
        sourceSessionId: 'session',
        sourceEntryId: `source-${index}`,
        sourceRevision: 1,
        sequence: index + 1,
        kind,
        recordedAt: asOf,
        createdAt: asOf,
        updatedAt: asOf,
        deletedAt: null,
        earlierLogging: true,
        volumeMl: null,
        abvPercent: null,
        ethanolGrams: null,
      })),
    };
  }
  it('warns at each additional drink once earlier counts use the planned number', () => {
    const target = member(['drink', 'shot']);
    const before = structuredClone(target);
    for (const knownCount of [0, 1, 2]) {
      const logs = Array.from({ length: knownCount }, () => ({
        ethanolGrams: 0.1,
        deletedAt: null,
      }));
      expect(requiredMemberLogConfirmations(target, logs, 0.1, false)).toEqual(['plan_exceeded']);
    }
    expect(target).toEqual(before);
  });
  it('does not warn when combined counts reach the plan exactly', () => {
    expect(requiredMemberLogConfirmations(member(['drink']), [], 1, false)).toEqual([]);
    expect(
      requiredMemberLogConfirmations(
        member(['drink']),
        [{ ethanolGrams: 1, deletedAt: null }],
        1,
        false,
      ),
    ).toEqual(['plan_exceeded']);
  });
  it('excludes chasers, deleted quick drinks and deleted measured entries', () => {
    const target = member(['drink', 'chaser']);
    const removed = target.quickLogs?.[0];
    if (!removed) throw new Error('Missing fixture');
    removed.deletedAt = asOf;
    expect(
      requiredMemberLogConfirmations(target, [{ ethanolGrams: 100, deletedAt: asOf }], 1, false),
    ).toEqual([]);
  });
  it('retains measured-alcohol and planned-end checks independently of counts', () => {
    expect(requiredMemberLogConfirmations(member([]), [], 100, true)).toEqual([
      'plan_exceeded',
      'after_end',
    ]);
    expect(requiredMemberLogConfirmations(member(['drink']), [], 1, true)).toEqual(['after_end']);
    // Smaller measured servings retain the existing alcohol-based rule without unknown earlier drinks.
    expect(
      requiredMemberLogConfirmations(
        member([]),
        Array.from({ length: 3 }, () => ({ ethanolGrams: 1, deletedAt: null })),
        1,
        false,
      ),
    ).toEqual([]);
  });
  it('does not use archived plan quantities to dismiss a warning', () => {
    const target = member(['drink', 'drink']);
    const plan = target.planItems[0];
    if (!plan) throw new Error('Missing fixture');
    target.planItems.push({ ...plan, id: 'old-plan', plannedQuantity: 20, archivedAt: asOf });
    expect(requiredMemberLogConfirmations(target, [], 1, false)).toEqual(['plan_exceeded']);
  });
});

describe('current alert relevance', () => {
  const alert = {
    id: 'alert',
    nightId: 'night',
    nightMemberId: 'member',
    type: 'personal_pace' as const,
    severity: 'caution' as const,
    visibility: 'private' as const,
    message: 'Pause',
    dedupeKey: 'key',
    createdAt: '2026-07-31T21:55:00Z',
    expiresAt: null,
  };
  it('clears after an undo or the rolling window passes', () => {
    expect(isNightAlertRelevant(alert, [log(25, '21:55')], 30, asOf)).toBe(true);
    expect(isNightAlertRelevant(alert, [log(25, '21:55', asOf)], 30, asOf)).toBe(false);
    expect(isNightAlertRelevant(alert, [log(25, '21:55')], 30, '2026-07-31T23:00:00Z')).toBe(false);
  });
  it('respects explicit expiration and the current plan', () => {
    expect(isNightAlertRelevant({ ...alert, expiresAt: asOf }, [log(25, '21:55')], 30, asOf)).toBe(
      false,
    );
    expect(
      isNightAlertRelevant({ ...alert, type: 'plan_reached' }, [log(25, '21:55')], 30, asOf),
    ).toBe(false);
    expect(
      isNightAlertRelevant({ ...alert, type: 'plan_reached' }, [log(25, '21:55')], 25, asOf),
    ).toBe(true);
  });
});

describe('warning rules', () => {
  it('does not alert below the personal threshold', () => {
    expect(determinePersonalPaceAlert([log(19.999, '21:30')], 'member', asOf)).toBe(false);
  });

  it('alerts at the personal threshold and independently at the group threshold', () => {
    const logs = [log(20, '21:45'), log(20, '21:55')];
    expect(determinePersonalPaceAlert(logs, 'member', asOf)).toBe(true);
    expect(determineGroupCheckInAlert(logs, 'member', asOf)).toBe(true);
  });

  it('uses consumed_at and excludes records outside each rolling window', () => {
    const logs = [log(30, '19:59'), log(10, '21:55')];
    expect(calculateRollingAlcoholTotal(logs, 'member', asOf, 120)).toBe(10);
  });

  it('ignores deleted records and water', () => {
    const logs = [log(25, '21:55', '2026-07-31T22:01:00Z'), log(25, '21:56', null, 'water')];
    expect(determinePersonalPaceAlert(logs, 'member', asOf)).toBe(false);
  });

  it('deduplicates alerts during their configured cooldown', () => {
    const alerts = [
      {
        type: 'personal_pace' as const,
        nightMemberId: 'member',
        createdAt: '2026-07-31T21:30:01Z',
      },
    ];
    expect(isAlertInCooldown(alerts, 'personal_pace', 'member', asOf, 60)).toBe(true);
    expect(isAlertInCooldown(alerts, 'group_check_in', 'member', asOf, 120)).toBe(false);
  });

  it('combines plan and after-end confirmation in one checkpoint', () => {
    const warnings = requiredLogConfirmations('exceeded', true);
    expect(warnings).toEqual(['plan_exceeded', 'after_end']);
    expect(confirmationMessage(warnings)).toContain('beyond your plan');
  });

  it('does not require plan confirmation when the plan is reached exactly', () => {
    expect(requiredLogConfirmations('reached', false)).toEqual([]);
  });

  it('suppresses stale offline pace alerts but retains recent ones', () => {
    expect(shouldEmitRealtimePaceAlert('2026-07-31T21:50:00Z', asOf)).toBe(true);
    expect(shouldEmitRealtimePaceAlert('2026-07-31T21:44:59Z', asOf)).toBe(false);
  });
});

function log(
  grams: number,
  hhmm: string,
  deletedAt: string | null = null,
  kind: 'alcohol' | 'water' = 'alcohol',
): RollingLogValue {
  return {
    nightMemberId: 'member',
    ethanolGrams: grams,
    consumedAt: `2026-07-31T${hhmm}:00.000Z`,
    deletedAt,
    kind,
  };
}
