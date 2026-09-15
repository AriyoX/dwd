import {
  DRINK_PRESETS,
  planItemsSchema,
  type DrinkCategory,
  type PlanItemInput,
  type PlanSetupMode,
} from '@dwd/core';

export type PlanDraftItem = {
  id?: string | undefined;
  clientId?: string | undefined;
  label: string;
  category: DrinkCategory | '';
  volumeMl: number | string;
  abvPercent: number | string;
  plannedQuantity: number | string;
  isQuickLog: boolean;
};

export function newPlanItem(presetId?: string): PlanDraftItem {
  const preset =
    presetId === undefined ? undefined : DRINK_PRESETS.find((item) => item.id === presetId);
  return {
    clientId: crypto.randomUUID(),
    label: preset?.label ?? '',
    category: preset?.category ?? '',
    volumeMl: preset?.volumeMl ?? '',
    abvPercent: preset?.abvPercent ?? '',
    plannedQuantity: 1,
    isQuickLog: true,
  };
}

export function draftItemsFromPlan(items: readonly PlanItemInput[]): PlanDraftItem[] {
  return items.map((item) => ({ ...item }));
}

export function materializePlanDraft(
  mode: PlanSetupMode,
  items: readonly PlanDraftItem[],
): { success: true; data: PlanItemInput[] } | { success: false; message: string } {
  if (mode === 'water_only') return { success: true, data: [] };
  if (mode === 'unselected')
    return { success: false, message: 'Choose water only or plan drinks.' };
  if (items.length === 0)
    return { success: false, message: 'Choose a drink or select water only.' };
  const parsed = planItemsSchema.safeParse(
    items.map((item) => ({
      ...(item.id === undefined ? {} : { id: item.id }),
      ...(item.clientId === undefined ? {} : { clientId: item.clientId }),
      label: item.label,
      category: item.category,
      volumeMl: typeof item.volumeMl === 'string' ? Number(item.volumeMl) : item.volumeMl,
      abvPercent: typeof item.abvPercent === 'string' ? Number(item.abvPercent) : item.abvPercent,
      plannedQuantity:
        typeof item.plannedQuantity === 'string'
          ? Number(item.plannedQuantity)
          : item.plannedQuantity,
      isQuickLog: item.isQuickLog,
    })),
  );
  return parsed.success
    ? { success: true, data: parsed.data }
    : { success: false, message: parsed.error.issues[0]?.message ?? 'Check your drink details.' };
}
