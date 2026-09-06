import {
  GROUP_CHECK_IN_THRESHOLD_GRAMS,
  GROUP_CHECK_IN_WINDOW_MINUTES,
  PERSONAL_PACE_THRESHOLD_GRAMS,
  PERSONAL_PACE_WINDOW_MINUTES,
  STALE_OFFLINE_ALERT_MINUTES,
} from '../config/constants';
import type { AlcoholLog, NightAlert, PlanStatus } from '../types/domain';

export interface RollingLogValue {
  nightMemberId: string;
  ethanolGrams: number;
  consumedAt: string;
  deletedAt: string | null;
  kind?: 'alcohol' | 'water';
}

export function calculateRollingAlcoholTotal(
  logs: readonly RollingLogValue[],
  memberId: string,
  asOf: string | Date,
  windowMinutes: number,
): number {
  const end = dateMs(asOf);
  const start = end - windowMinutes * 60_000;
  return (
    Math.round(
      logs
        .filter((log) => {
          const consumed = dateMs(log.consumedAt);
          return (
            log.nightMemberId === memberId &&
            log.deletedAt === null &&
            log.kind !== 'water' &&
            consumed >= start &&
            consumed <= end
          );
        })
        .reduce((sum, log) => sum + log.ethanolGrams, 0) * 1000,
    ) / 1000
  );
}

export function determinePersonalPaceAlert(
  logs: readonly RollingLogValue[],
  memberId: string,
  asOf: string | Date,
): boolean {
  return (
    calculateRollingAlcoholTotal(logs, memberId, asOf, PERSONAL_PACE_WINDOW_MINUTES) >=
    PERSONAL_PACE_THRESHOLD_GRAMS
  );
}

export function determineGroupCheckInAlert(
  logs: readonly RollingLogValue[],
  memberId: string,
  asOf: string | Date,
): boolean {
  return (
    calculateRollingAlcoholTotal(logs, memberId, asOf, GROUP_CHECK_IN_WINDOW_MINUTES) >=
    GROUP_CHECK_IN_THRESHOLD_GRAMS
  );
}

export function shouldEmitRealtimePaceAlert(
  consumedAt: string | Date,
  receivedAt: string | Date,
): boolean {
  const age = dateMs(receivedAt) - dateMs(consumedAt);
  return age >= 0 && age <= STALE_OFFLINE_ALERT_MINUTES * 60_000;
}

export function isAlertInCooldown(
  alerts: readonly Pick<NightAlert, 'type' | 'nightMemberId' | 'createdAt'>[],
  type: NightAlert['type'],
  memberId: string,
  now: string | Date,
  cooldownMinutes: number,
): boolean {
  const cutoff = dateMs(now) - cooldownMinutes * 60_000;
  return alerts.some(
    (alert) =>
      alert.type === type && alert.nightMemberId === memberId && dateMs(alert.createdAt) > cutoff,
  );
}

export function requiredLogConfirmations(
  projectedPlanStatusValue: PlanStatus,
  afterEnd: boolean,
): Array<'plan_exceeded' | 'after_end'> {
  const warnings: Array<'plan_exceeded' | 'after_end'> = [];
  if (projectedPlanStatusValue === 'exceeded') warnings.push('plan_exceeded');
  if (afterEnd) warnings.push('after_end');
  return warnings;
}

export function confirmationMessage(warnings: readonly ('plan_exceeded' | 'after_end')[]): string {
  if (warnings.length === 2) {
    return 'This is beyond your plan and your planned night has ended. Log it anyway?';
  }
  if (warnings.includes('plan_exceeded')) {
    return 'This is beyond the plan you set earlier. Log it anyway?';
  }
  return 'Your planned night has ended. Log this drink anyway?';
}

export function toRollingValues(logs: readonly AlcoholLog[]): RollingLogValue[] {
  return logs.map((log) => ({
    nightMemberId: log.nightMemberId,
    ethanolGrams: log.ethanolGrams,
    consumedAt: log.consumedAt,
    deletedAt: log.deletedAt,
    kind: 'alcohol',
  }));
}

function dateMs(value: string | Date): number {
  const result = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(result)) throw new RangeError('Invalid date value.');
  return result;
}
