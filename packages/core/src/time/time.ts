import type { Night, NightEndTimeChange, NightTimeStatus } from '../types/domain';

export function determineNightTimeStatus(
  night: Pick<Night, 'status' | 'endsAt' | 'endedAt'>,
  now: string | Date,
): NightTimeStatus {
  if (night.status === 'ended' || night.endedAt !== null) return 'ended';
  return toMs(now) >= toMs(night.endsAt) ? 'overdue' : 'active';
}

export function resolveApplicablePlannedEnd(
  initialEndsAt: string,
  changes: readonly Pick<NightEndTimeChange, 'effectiveAt' | 'newEndsAt'>[],
  consumedAt: string | Date,
): string {
  const consumedMs = toMs(consumedAt);
  const applicable = changes
    .filter((change) => toMs(change.effectiveAt) <= consumedMs)
    .sort((a, b) => toMs(b.effectiveAt) - toMs(a.effectiveAt))[0];
  return applicable?.newEndsAt ?? initialEndsAt;
}

export function isAfterApplicableEnd(
  initialEndsAt: string,
  changes: readonly Pick<NightEndTimeChange, 'effectiveAt' | 'newEndsAt'>[],
  consumedAt: string | Date,
): boolean {
  return toMs(consumedAt) > toMs(resolveApplicablePlannedEnd(initialEndsAt, changes, consumedAt));
}

export function millisecondsRemaining(endsAt: string, now: string | Date): number {
  return toMs(endsAt) - toMs(now);
}

export function canUsePlanVersion(
  version: { createdAt: string; archivedAt: string | null },
  consumedAt: string | Date,
): boolean {
  const consumed = toMs(consumedAt);
  return (
    toMs(version.createdAt) <= consumed &&
    (version.archivedAt === null || consumed <= toMs(version.archivedAt))
  );
}

export type PostEndSyncEligibility = 'allowed' | 'after_actual_end' | 'grace_expired';

export function determinePostEndSyncEligibility(
  consumedAt: string | Date,
  endedAt: string | Date,
  receivedAt: string | Date,
  graceHours = 24,
): PostEndSyncEligibility {
  if (toMs(consumedAt) > toMs(endedAt)) return 'after_actual_end';
  if (toMs(receivedAt) > toMs(endedAt) + graceHours * 60 * 60 * 1000) return 'grace_expired';
  return 'allowed';
}

function toMs(value: string | Date): number {
  const milliseconds = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new RangeError('Invalid date value.');
  return milliseconds;
}
