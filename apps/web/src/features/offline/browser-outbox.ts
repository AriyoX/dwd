'use client';

import { BrowserPendingLogStore } from '@/adapters/pending-log-store.browser';
import {
  deleteActivityAction,
  logDrinkAction,
  logWaterAction,
  resolveDrinkAction,
} from '@/features/drink-logging/actions';
import { OutboxCoordinator } from './outbox';

export interface BrowserOutboxBundle {
  store: BrowserPendingLogStore;
  outbox: OutboxCoordinator;
}

export function createBrowserOutbox(): BrowserOutboxBundle {
  const store = new BrowserPendingLogStore();
  const outbox = new OutboxCoordinator(store, {
    send: async (record) => {
      if (record.kind === 'water') {
        return logWaterAction({
          targetMemberId: record.nightMemberId,
          consumedAt: record.consumedAt,
          idempotencyKey: record.idempotencyKey,
        });
      }
      return logDrinkAction({
        targetMemberId: record.nightMemberId,
        ...(record.planItemId === undefined ? {} : { planItemId: record.planItemId }),
        ...(record.customDrink === undefined ? {} : { customDrink: record.customDrink }),
        consumedAt: record.consumedAt,
        idempotencyKey: record.idempotencyKey,
        acknowledgePlanExceeded: record.acknowledgePlanExceeded,
        acknowledgeAfterEnd: record.acknowledgeAfterEnd,
      });
    },
    resolveAlcohol: resolveDrinkAction,
    softDelete: async (logId, kind) => (await deleteActivityAction({ logId, kind })).ok,
  });
  return { store, outbox };
}
