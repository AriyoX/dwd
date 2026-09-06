import { calculateEthanolGrams, roundGrams } from '../alcohol/calculations';
import { NUMERIC_TOLERANCE_GRAMS } from '../config/constants';
import type { AlcoholLog, PlanItemInput, PlanStatus } from '../types/domain';

export function calculatePlanItemEthanol(item: PlanItemInput): number {
  return roundGrams(calculateEthanolGrams(item.volumeMl, item.abvPercent) * item.plannedQuantity);
}

export function calculatePlanTotal(items: readonly PlanItemInput[]): number {
  return roundGrams(items.reduce((total, item) => total + calculatePlanItemEthanol(item), 0));
}

export function determinePlanStatus(
  loggedEthanolGrams: number,
  plannedEthanolGrams: number,
  tolerance = NUMERIC_TOLERANCE_GRAMS,
): PlanStatus {
  if (loggedEthanolGrams > plannedEthanolGrams + tolerance) return 'exceeded';
  if (Math.abs(loggedEthanolGrams - plannedEthanolGrams) <= tolerance) return 'reached';
  return 'within_plan';
}

export function calculateLoggedEthanol(logs: readonly AlcoholLog[]): number {
  return roundGrams(
    logs
      .filter((log) => log.deletedAt === null)
      .reduce((total, log) => total + log.ethanolGrams, 0),
  );
}

export function projectedPlanStatus(
  logs: readonly AlcoholLog[],
  planItems: readonly PlanItemInput[],
  proposedEthanolGrams: number,
): PlanStatus {
  return determinePlanStatus(
    calculateLoggedEthanol(logs) + proposedEthanolGrams,
    calculatePlanTotal(planItems),
  );
}
