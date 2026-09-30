import type { AlcoholLog, DrinkCategory, PlanItemInput, SharedBottle } from '../types/domain';

export function bottlePlanItem(
  bottle: SharedBottle,
  quantity: number,
  pourMl = bottle.pourMl,
): PlanItemInput {
  return {
    sharedBottleId: bottle.id,
    label: bottle.label,
    category: bottle.category,
    volumeMl: pourMl,
    abvPercent: bottle.abvPercent,
    plannedQuantity: quantity,
    isQuickLog: true,
  };
}

export function buildBottlePlan(
  items: readonly PlanItemInput[],
  bottle: SharedBottle,
  quantity: number,
  mode: 'add' | 'replace',
  pourMl = bottle.pourMl,
  makeMain = true,
): PlanItemInput[] {
  const item = bottlePlanItem(bottle, quantity, pourMl);
  if (mode === 'replace') return [item];
  const existing = items.findIndex((entry) => entry.sharedBottleId === bottle.id);
  if (existing >= 0)
    return items.map((entry, index) =>
      index === existing
        ? { ...item, isQuickLog: makeMain || entry.isQuickLog }
        : { ...entry, isQuickLog: makeMain ? false : entry.isQuickLog },
    );
  return [
    ...items.map((entry) => ({ ...entry, isQuickLog: makeMain ? false : entry.isQuickLog })),
    { ...item, isQuickLog: makeMain || items.length === 0 },
  ];
}

export function bottleDrinkWord(category: DrinkCategory): 'shot' | 'drink' {
  return category === 'spirit' ? 'shot' : 'drink';
}

export function bottlePlanProgress(
  bottleId: string,
  logs: readonly AlcoholLog[],
  sizeMl: number,
): number {
  const totalMl = logs
    .filter((log) => log.sharedBottleId === bottleId && !log.deletedAt)
    .reduce((total, log) => total + log.volumeMl, 0);
  return Math.round((totalMl / sizeMl) * 10) / 10;
}
