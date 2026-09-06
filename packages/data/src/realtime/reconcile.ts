import type { AlcoholLog } from '@dwd/core';

export interface OptimisticAlcoholLog {
  idempotencyKey: string;
  ethanolGrams: number;
  consumedAt: string;
  labelSnapshot: string;
  nightMemberId: string;
}

export function reconcileAlcoholLogs(
  canonical: readonly AlcoholLog[],
  optimistic: readonly OptimisticAlcoholLog[],
): Array<AlcoholLog | OptimisticAlcoholLog> {
  const canonicalKeys = new Set(canonical.map((log) => log.idempotencyKey));
  return [...canonical, ...optimistic.filter((log) => !canonicalKeys.has(log.idempotencyKey))];
}
