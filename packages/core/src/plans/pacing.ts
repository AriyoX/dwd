import { calculateEthanolGrams } from '../alcohol/calculations';
import { PERSONAL_PACE_THRESHOLD_GRAMS, PERSONAL_PACE_WINDOW_MINUTES } from '../config/constants';
import { calculatePlanTotal, determinePlanStatus } from './plans';
import type { PlanItemInput } from '../types/domain';
import { determinePersonalPaceAlert, type RollingLogValue } from '../warnings/warnings';

/** Plan spacing only: this does not estimate metabolism, impairment or a safe rate. */
export function calculatePlanPacing(
  items: readonly PlanItemInput[],
  logs: readonly RollingLogValue[],
  memberId: string,
  startsAt: string,
  endsAt: string,
  asOf: string | Date,
): {
  intervalMinutes: number;
  waitMinutes: number;
  status: 'spacing' | 'pause' | 'finished' | 'packed';
} | null {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  const now = asOf instanceof Date ? asOf.getTime() : Date.parse(asOf);
  const main = items.find((item) => item.isQuickLog) ?? items[0];
  if (!main || ![start, end, now].every(Number.isFinite) || end <= start) return null;
  const planned = calculatePlanTotal(items);
  if (planned <= 0) return null;
  const active = logs.filter(
    (log) =>
      log.nightMemberId === memberId &&
      log.deletedAt === null &&
      log.kind !== 'water' &&
      Date.parse(log.consumedAt) <= now,
  );
  const total = active.reduce((sum, log) => sum + log.ethanolGrams, 0);
  const millisecondsPerGram = (end - start) / planned;
  const intervalMinutes = Math.ceil(
    (calculateEthanolGrams(main.volumeMl, main.abvPercent) * millisecondsPerGram) / 60_000 - 1e-9,
  );
  const last = [...active].sort((a, b) => Date.parse(b.consumedAt) - Date.parse(a.consumedAt))[0];
  // A late start or a stronger drink must never produce a catch-up recommendation.
  const next = Math.max(
    start + total * millisecondsPerGram,
    last ? Date.parse(last.consumedAt) + last.ethanolGrams * millisecondsPerGram : start,
  );
  const waitMinutes = last ? Math.max(0, Math.ceil((next - now) / 60_000)) : 0;
  if (now >= end || determinePlanStatus(total, planned) !== 'within_plan')
    return { intervalMinutes, waitMinutes: 0, status: 'finished' };
  if (
    planned / ((end - start) / 60_000) >=
    PERSONAL_PACE_THRESHOLD_GRAMS / PERSONAL_PACE_WINDOW_MINUTES
  )
    return { intervalMinutes, waitMinutes, status: 'packed' };
  if (next >= end || determinePersonalPaceAlert(active, memberId, asOf))
    return { intervalMinutes, waitMinutes, status: 'pause' };
  return { intervalMinutes, waitMinutes, status: 'spacing' };
}
