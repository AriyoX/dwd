import {
  ALCOHOL_DENSITY_GRAMS_PER_ML,
  INPUT_LIMITS,
  STANDARD_DRINK_GRAMS,
} from '../config/constants';
import type { AlcoholLog, DrinkCategory, WaterLog } from '../types/domain';

function assertFiniteWithin(value: number, min: number, max: number, name: string): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be between ${min} and ${max}.`);
  }
}

export function calculateEthanolGrams(volumeMl: number, abvPercent: number): number {
  assertFiniteWithin(volumeMl, INPUT_LIMITS.volumeMl.min, INPUT_LIMITS.volumeMl.max, 'Volume');
  if (!Number.isFinite(abvPercent) || abvPercent <= 0 || abvPercent > INPUT_LIMITS.abvPercent.max) {
    throw new RangeError(`ABV must be greater than 0 and at most ${INPUT_LIMITS.abvPercent.max}.`);
  }

  return roundGrams(volumeMl * (abvPercent / 100) * ALCOHOL_DENSITY_GRAMS_PER_ML);
}

export function calculateStandardDrinkEquivalent(ethanolGrams: number): number {
  if (!Number.isFinite(ethanolGrams) || ethanolGrams < 0) {
    throw new RangeError('Ethanol grams must be zero or greater.');
  }
  return Math.round((ethanolGrams / STANDARD_DRINK_GRAMS) * 100) / 100;
}

export function roundGrams(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

export interface MemberTotals {
  alcoholCount: number;
  waterCount: number;
  ethanolGrams: number;
  standardDrinkEquivalent: number;
  categoryCounts: Partial<Record<DrinkCategory, number>>;
  afterEndCount: number;
}

export function calculateMemberTotals(
  drinkLogs: readonly AlcoholLog[],
  waterLogs: readonly WaterLog[] = [],
): MemberTotals {
  const activeDrinks = drinkLogs.filter((log) => log.deletedAt === null);
  const ethanolGrams = roundGrams(activeDrinks.reduce((total, log) => total + log.ethanolGrams, 0));
  const categoryCounts: Partial<Record<DrinkCategory, number>> = {};

  for (const log of activeDrinks) {
    categoryCounts[log.categorySnapshot] = (categoryCounts[log.categorySnapshot] ?? 0) + 1;
  }

  return {
    alcoholCount: activeDrinks.length,
    waterCount: waterLogs.filter((log) => log.deletedAt === null).length,
    ethanolGrams,
    standardDrinkEquivalent: calculateStandardDrinkEquivalent(ethanolGrams),
    categoryCounts,
    afterEndCount: activeDrinks.filter((log) => log.afterEnd).length,
  };
}
