import { describe, expect, it } from 'vitest';
import {
  canUsePlanVersion,
  determineNightTimeStatus,
  determinePostEndSyncEligibility,
  isAfterApplicableEnd,
  formatNightDateTime,
  isValidIanaTimeZone,
  resolveWallTimeInTimeZone,
  safeTimeZone,
  wallClockFromInstant,
  resolveApplicablePlannedEnd,
} from './time';

describe('night time behavior', () => {
  const night = { status: 'active' as const, endsAt: '2026-07-31T22:00:00Z', endedAt: null };

  it('is active before the end and overdue exactly at or after it', () => {
    expect(determineNightTimeStatus(night, '2026-07-31T21:59:59Z')).toBe('active');
    expect(determineNightTimeStatus(night, '2026-07-31T22:00:00Z')).toBe('overdue');
    expect(determineNightTimeStatus(night, '2026-07-31T22:00:01Z')).toBe('overdue');
  });

  it('reports an explicitly ended night as ended', () => {
    expect(
      determineNightTimeStatus(
        { status: 'ended', endsAt: night.endsAt, endedAt: '2026-07-31T22:10:00Z' },
        '2026-07-31T21:00:00Z',
      ),
    ).toBe('ended');
  });

  it('applies extensions prospectively without reclassifying earlier logs', () => {
    const changes = [
      {
        effectiveAt: '2026-07-31T22:05:00Z',
        newEndsAt: '2026-07-31T22:30:00Z',
      },
    ];
    expect(resolveApplicablePlannedEnd(night.endsAt, changes, '2026-07-31T22:03:00Z')).toBe(
      night.endsAt,
    );
    expect(isAfterApplicableEnd(night.endsAt, changes, '2026-07-31T22:03:00Z')).toBe(true);
    expect(isAfterApplicableEnd(night.endsAt, changes, '2026-07-31T22:10:00Z')).toBe(false);
  });

  it('keeps an archived plan version valid at its historical consumed time', () => {
    const version = {
      createdAt: '2026-07-31T20:00:00Z',
      archivedAt: '2026-07-31T21:00:00Z',
    };
    expect(canUsePlanVersion(version, '2026-07-31T20:59:59Z')).toBe(true);
    expect(canUsePlanVersion(version, '2026-07-31T21:00:01Z')).toBe(false);
  });

  it('allows only pre-end logs during the 24-hour post-end grace', () => {
    expect(
      determinePostEndSyncEligibility(
        '2026-07-31T21:59:00Z',
        '2026-07-31T22:00:00Z',
        '2026-08-01T21:59:59Z',
      ),
    ).toBe('allowed');
    expect(
      determinePostEndSyncEligibility(
        '2026-07-31T22:00:01Z',
        '2026-07-31T22:00:00Z',
        '2026-07-31T22:01:00Z',
      ),
    ).toBe('after_actual_end');
    expect(
      determinePostEndSyncEligibility(
        '2026-07-31T21:59:00Z',
        '2026-07-31T22:00:00Z',
        '2026-08-01T22:00:01Z',
      ),
    ).toBe('grace_expired');
  });
});

describe('named time zones', () => {
  it('resolves Nairobi, UTC, Kathmandu, and a midnight boundary deterministically', () => {
    expect(resolveWallTimeInTimeZone('2026-01-01', '00:15', 'Africa/Nairobi')).toBe(
      '2025-12-31T21:15:00.000Z',
    );
    expect(resolveWallTimeInTimeZone('2026-01-01', '00:15', 'UTC')).toBe(
      '2026-01-01T00:15:00.000Z',
    );
    expect(resolveWallTimeInTimeZone('2026-01-01', '00:15', 'Asia/Kathmandu')).toBe(
      '2025-12-31T18:30:00.000Z',
    );
    expect(wallClockFromInstant('2025-12-31T21:15:00Z', 'Africa/Nairobi')).toEqual({
      date: '2026-01-01',
      time: '00:15',
    });
  });

  it('rejects a spring DST gap and picks the earlier repeated fall time', () => {
    expect(() => resolveWallTimeInTimeZone('2026-03-08', '02:30', 'America/New_York')).toThrow(
      'does not exist',
    );
    expect(resolveWallTimeInTimeZone('2026-11-01', '01:30', 'America/New_York')).toBe(
      '2026-11-01T05:30:00.000Z',
    );
  });

  it('falls back only for display when legacy metadata is invalid', () => {
    expect(isValidIanaTimeZone('America/New_York')).toBe(true);
    expect(isValidIanaTimeZone('not/a-zone')).toBe(false);
    expect(safeTimeZone('not/a-zone')).toBe('UTC');
    expect(formatNightDateTime('2026-01-01T00:00:00Z', 'UTC')).toContain('Jan 1, 2026');
  });
});
