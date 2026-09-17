import { calculateEthanolGrams, type AlcoholLog, type MemberSnapshot } from '@dwd/core';
import type { PendingDrinkLog } from '@dwd/contracts';

/** Count queued entries once; rejected or unconfirmed entries aren't consumption. */
export function withPendingDrinks(
  member: MemberSnapshot,
  pending: readonly PendingDrinkLog[],
): AlcoholLog[] {
  const saved = new Set(member.drinkLogs.map((log) => log.idempotencyKey));
  return [
    ...member.drinkLogs,
    ...pending.flatMap((record): AlcoholLog[] => {
      if (
        record.nightMemberId !== member.id ||
        record.kind !== 'alcohol' ||
        !record.drinkSnapshot ||
        saved.has(record.idempotencyKey) ||
        record.status === 'permanent_failure' ||
        record.status === 'needs_confirmation'
      )
        return [];
      saved.add(record.idempotencyKey);
      const drink = record.drinkSnapshot;
      return [
        {
          id: record.idempotencyKey,
          idempotencyKey: record.idempotencyKey,
          nightId: member.nightId,
          nightMemberId: member.id,
          actorUserId: record.actorUserId,
          planItemId: record.planItemId ?? null,
          labelSnapshot: drink.label,
          categorySnapshot: drink.category,
          volumeMl: drink.volumeMl,
          abvPercent: drink.abvPercent,
          ethanolGrams: calculateEthanolGrams(drink.volumeMl, drink.abvPercent),
          consumedAt: record.consumedAt,
          createdAt: record.createdLocallyAt,
          afterEnd: false,
          deletedAt: null,
        },
      ];
    }),
  ];
}
