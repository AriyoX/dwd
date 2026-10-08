import type { CustomDrinkInput, MemberSnapshot } from '@dwd/core';

export function drinkKey(drink: CustomDrinkInput) {
  return JSON.stringify([drink.label, drink.category, drink.volumeMl, drink.abvPercent]);
}

/** Reuse this person's drinks from tonight; bottle pours must retain their own stock flow. */
export function recentDrinks(member: MemberSnapshot): CustomDrinkInput[] {
  const seen = new Set(
    member.planItems.filter((item) => !item.archivedAt && !item.sharedBottleId).map(drinkKey),
  );
  const recent: CustomDrinkInput[] = [];
  for (const log of [...member.drinkLogs].sort(
    (a, b) => Date.parse(b.consumedAt) - Date.parse(a.consumedAt),
  )) {
    if (log.deletedAt || log.sharedBottleId) continue;
    const drink: CustomDrinkInput = {
      label: log.labelSnapshot,
      category: log.categorySnapshot,
      volumeMl: log.volumeMl,
      abvPercent: log.abvPercent,
    };
    const key = drinkKey(drink);
    if (seen.has(key)) continue;
    seen.add(key);
    recent.push(drink);
    if (recent.length === 3) break;
  }
  return recent;
}
