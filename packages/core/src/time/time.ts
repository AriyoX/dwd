import type { Night, NightEndTimeChange, NightTimeStatus } from '../types/domain';

export function isValidIanaTimeZone(timeZone: string): boolean {
  if (typeof timeZone !== 'string' || timeZone.trim() === '') return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function safeTimeZone(timeZone: string | null | undefined): string {
  return timeZone !== undefined && timeZone !== null && isValidIanaTimeZone(timeZone)
    ? timeZone
    : 'UTC';
}

export function resolveWallTimeInTimeZone(date: string, time: string, timeZone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new RangeError('Enter a valid date and time.');
  }
  if (!isValidIanaTimeZone(timeZone)) throw new RangeError('Choose a valid time zone.');
  const [yearText, monthText, dayText] = date.split('-');
  const [hourText, minuteText] = time.split(':');
  const year = Number(yearText ?? 'NaN');
  const month = Number(monthText ?? 'NaN');
  const day = Number(dayText ?? 'NaN');
  const hour = Number(hourText ?? 'NaN');
  const minute = Number(minuteText ?? 'NaN');
  if (![year, month, day, hour, minute].every(Number.isFinite))
    throw new RangeError('Enter a valid date and time.');
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const wanted = { year, month, day, hour, minute };
  const offsets = new Set<number>();
  for (let delta = -36 * 60; delta <= 36 * 60; delta += 30) {
    const instant = new Date(naive + delta * 60_000);
    const parts = zonedParts(instant, timeZone);
    offsets.add(
      Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) -
        instant.getTime(),
    );
  }
  const candidates = [...offsets]
    .map((offset) => new Date(naive - offset))
    .filter((candidate) => {
      const parts = zonedParts(candidate, timeZone);
      return (
        parts.year === wanted.year &&
        parts.month === wanted.month &&
        parts.day === wanted.day &&
        parts.hour === wanted.hour &&
        parts.minute === wanted.minute
      );
    })
    .sort((a, b) => a.getTime() - b.getTime());
  if (candidates.length === 0) {
    throw new RangeError('That local time does not exist in the selected time zone.');
  }
  // Repeated DST times use the earlier instant consistently.
  const first = candidates[0];
  if (first === undefined)
    throw new RangeError('That local time does not exist in the selected time zone.');
  return first.toISOString();
}

export function formatNightDateTime(
  value: string | Date | null,
  timeZone: string | null | undefined,
): string {
  if (value === null) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Invalid date';
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: safeTimeZone(timeZone),
    timeZoneName: 'short',
  }).format(date);
}

export function wallClockFromInstant(
  value: string | Date,
  timeZone: string,
): { date: string; time: string } {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid date value.');
  const parts = zonedParts(date, safeTimeZone(timeZone));
  return {
    date: `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`,
    time: `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`,
  };
}

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

function zonedParts(
  value: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  return {
    year: values['year'] ?? NaN,
    month: values['month'] ?? NaN,
    day: values['day'] ?? NaN,
    hour: values['hour'] ?? NaN,
    minute: values['minute'] ?? NaN,
  };
}
