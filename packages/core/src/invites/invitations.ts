import type { NightStatus } from '../types/domain';

export interface InvitationState {
  expiresAt: string;
  revokedAt: string | null;
  maxUses: number | null;
  useCount: number;
  nightStatus: NightStatus;
}

export type InvitationDecision = 'valid' | 'expired' | 'revoked' | 'full' | 'ended';

export function evaluateInvitation(
  invitation: InvitationState,
  now: string | Date,
): InvitationDecision {
  if (invitation.nightStatus === 'ended') return 'ended';
  if (invitation.revokedAt !== null) return 'revoked';
  if (Date.parse(invitation.expiresAt) <= toMs(now)) return 'expired';
  if (invitation.maxUses !== null && invitation.useCount >= invitation.maxUses) return 'full';
  return 'valid';
}

function toMs(value: string | Date): number {
  const result = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(result)) throw new RangeError('Invalid date value.');
  return result;
}
