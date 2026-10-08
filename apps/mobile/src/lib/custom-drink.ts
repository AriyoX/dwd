import { customDrinkSchema, type CustomDrinkInput, type DrinkCategory } from '@dwd/core';

export interface CustomDrinkDraft {
  label: string;
  category: DrinkCategory;
  volume: string;
  abv: string;
}
export type DrinkFieldErrors = Partial<Record<'label' | 'volume' | 'abv', string>>;
export const customServing: Record<DrinkCategory, string> = {
  beer: '330',
  wine: '150',
  spirit: '30',
  cocktail: '250',
  other: '330',
};

export function parseCustomDrink(
  draft: CustomDrinkDraft,
): { success: true; data: CustomDrinkInput } | { success: false; errors: DrinkFieldErrors } {
  const decimal = (value: string) =>
    /^\d+(?:[.,]\d+)?$/.test(value.trim()) ? Number(value.trim().replace(',', '.')) : NaN;
  const volumeMl = decimal(draft.volume);
  const abvPercent = decimal(draft.abv);
  const errors: DrinkFieldErrors = {};
  if (!draft.label.trim()) errors.label = 'Give your drink a name.';
  if (!Number.isFinite(volumeMl) || volumeMl < 1 || volumeMl > 2000)
    errors.volume = 'Use a serving size from 1 to 2,000 ml.';
  if (!Number.isFinite(abvPercent) || abvPercent <= 0 || abvPercent > 95)
    errors.abv = 'Use an alcohol strength above 0% and up to 95%.';
  if (Object.keys(errors).length) return { success: false, errors };
  const parsed = customDrinkSchema.safeParse({
    label: draft.label,
    category: draft.category,
    volumeMl,
    abvPercent,
  });
  return parsed.success
    ? { success: true, data: parsed.data }
    : { success: false, errors: { label: 'Check the drink name.' } };
}
