import { describe, expect, it } from 'vitest';
import { evaluateInvitation, type InvitationState } from './invitations';

const now = '2026-07-31T20:00:00Z';
const valid: InvitationState = {
  expiresAt: '2026-08-01T20:00:00Z',
  revokedAt: null,
  maxUses: 5,
  useCount: 0,
  nightStatus: 'active',
};

describe('invitation decisions', () => {
  it('accepts a valid invitation', () => expect(evaluateInvitation(valid, now)).toBe('valid'));
  it('rejects an expired invitation', () =>
    expect(evaluateInvitation({ ...valid, expiresAt: now }, now)).toBe('expired'));
  it('rejects a revoked invitation', () =>
    expect(evaluateInvitation({ ...valid, revokedAt: now }, now)).toBe('revoked'));
  it('enforces maximum uses', () =>
    expect(evaluateInvitation({ ...valid, useCount: 5 }, now)).toBe('full'));
  it('rejects an invitation after the night ends', () =>
    expect(evaluateInvitation({ ...valid, nightStatus: 'ended' }, now)).toBe('ended'));
});
