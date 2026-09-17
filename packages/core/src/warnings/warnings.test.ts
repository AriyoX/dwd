import { describe, expect, it } from 'vitest';
import {
  calculateRollingAlcoholTotal,
  confirmationMessage,
  determineGroupCheckInAlert,
  determinePersonalPaceAlert,
  isAlertInCooldown,
  isNightAlertRelevant,
  requiredLogConfirmations,
  shouldEmitRealtimePaceAlert,
  type RollingLogValue,
} from './warnings';

const asOf = '2026-07-31T22:00:00.000Z';

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
