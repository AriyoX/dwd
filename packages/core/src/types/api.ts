import type { NightSnapshot } from './domain';

export interface StartNightResult {
  nightId: string;
  snapshot: NightSnapshot;
  duplicate: boolean;
}

export interface InviteCreationResult {
  inviteId: string;
  expiresAt: string;
}

export interface InviteRedemptionResult {
  nightId: string;
  memberId: string;
  joined: boolean;
  reactivated: boolean;
  needsPlan: boolean;
}

export interface MutationResult<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}
