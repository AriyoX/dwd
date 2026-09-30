import { z } from 'zod';
import { drinkCategorySchema, sharedBottleInputSchema } from '@dwd/core';

export const bottleDraftSchema = z.object({
  id: z.uuid(),
  label: z.string().max(60),
  category: drinkCategorySchema,
  volumeMl: z.string(),
  abvPercent: z.string(),
  pourMl: z.string(),
  defaultQuantity: z.string(),
  access: z.enum(['everyone', 'selected']),
  allowedMemberIds: z.array(z.uuid()),
});
export type BottleDraft = z.infer<typeof bottleDraftSchema>;

export function newBottleDraft(): BottleDraft {
  return {
    id: crypto.randomUUID(),
    label: '',
    category: 'spirit',
    volumeMl: '750',
    abvPercent: '40',
    pourMl: '30',
    defaultQuantity: '1',
    access: 'everyone',
    allowedMemberIds: [],
  };
}

export function materializeBottle(draft: BottleDraft) {
  return sharedBottleInputSchema.safeParse({
    ...draft,
    volumeMl: Number(draft.volumeMl),
    abvPercent: Number(draft.abvPercent),
    pourMl: Number(draft.pourMl),
    defaultQuantity: Number(draft.defaultQuantity),
  });
}
