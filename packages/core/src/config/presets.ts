import type { DrinkCategory, PlanItemInput } from '../types/domain';

export interface DrinkPreset {
  id: string;
  label: string;
  category: DrinkCategory;
  volumeMl: number;
  abvPercent: number;
  estimate?: boolean;
}

export const DRINK_PRESETS: readonly DrinkPreset[] = [
  { id: 'beer', label: 'Beer', category: 'beer', volumeMl: 330, abvPercent: 5 },
  { id: 'wine', label: 'Wine', category: 'wine', volumeMl: 150, abvPercent: 12 },
  { id: 'shot', label: 'Shot', category: 'spirit', volumeMl: 40, abvPercent: 40 },
  {
    id: 'cocktail',
    label: 'Cocktail',
    category: 'cocktail',
    volumeMl: 200,
    abvPercent: 15,
    estimate: true,
  },
] as const;

export function presetToPlanItem(preset: DrinkPreset, plannedQuantity = 1): PlanItemInput {
  return {
    label: preset.label,
    category: preset.category,
    volumeMl: preset.volumeMl,
    abvPercent: preset.abvPercent,
    plannedQuantity,
    isQuickLog: false,
  };
}
