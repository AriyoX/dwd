import { describe, expect, it } from 'vitest';
import {
  canUsePlanVersion,
  determineNightTimeStatus,
  determinePostEndSyncEligibility,
  isAfterApplicableEnd,
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
