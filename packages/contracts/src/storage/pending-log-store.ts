import type { CustomDrinkInput } from '@dwd/core';

export type PendingLogStatus =
  'pending' | 'syncing' | 'needs_confirmation' | 'failed' | 'permanent_failure';

export type PendingActivityKind = 'alcohol' | 'water';

export interface PendingDrinkLog {
  idempotencyKey: string;
  kind: PendingActivityKind;
  actorUserId: string;
  nightId: string;
  nightMemberId: string;
  memberDisplayName: string;
  planItemId?: string | undefined;
  planItemLabel?: string | undefined;
  drinkSnapshot?: CustomDrinkInput | undefined;
  customDrink?: CustomDrinkInput | undefined;
  consumedAt: string;
  status: PendingLogStatus;
  retryCount: number;
  lastError?: string | undefined;
  requiredWarnings?: ('plan_exceeded' | 'after_end')[] | undefined;
  acknowledgePlanExceeded: boolean;
  acknowledgeAfterEnd: boolean;
  createdLocallyAt: string;
}

export interface PendingLogStore {
  getAll(): Promise<PendingDrinkLog[]>;
  save(log: PendingDrinkLog): Promise<void>;
  remove(idempotencyKey: string): Promise<void>;
  update(idempotencyKey: string, patch: Partial<PendingDrinkLog>): Promise<void>;
  markFailed(idempotencyKey: string, reason: string, permanent?: boolean): Promise<void>;
  clearForNight(nightId: string): Promise<void>;
}
