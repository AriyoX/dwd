import { z } from 'zod';
import { drinkCategorySchema } from '@dwd/core';

// Drafts deliberately allow incomplete form values; submission uses startNightSchema.
const draftPlan = z
  .array(
    z.object({
      id: z.uuid().optional(),
      clientId: z.string().max(80).optional(),
      label: z.string().max(60),
      category: drinkCategorySchema.or(z.literal('')),
      volumeMl: z.union([z.number(), z.string()]),
      abvPercent: z.union([z.number(), z.string()]),
      plannedQuantity: z.union([z.number(), z.string()]),
      isQuickLog: z.boolean(),
    }),
  )
  .max(20);
export const nightDraftSchema = z.object({
  version: z.literal(1),
  userId: z.uuid(),
  creationKey: z.uuid(),
  inviteToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  step: z.number().int().min(1).max(3),
  title: z.string().max(80),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().max(80).optional(),
  withPeople: z.boolean(),
  hostPlanMode: z.enum(['unselected', 'water_only', 'drinks']).optional(),
  hostPlan: draftPlan,
  guests: z
    .array(
      z.object({
        clientId: z.string().max(80),
        displayName: z.string().max(60),
        planItems: draftPlan,
        planMode: z.enum(['unselected', 'water_only', 'drinks']).optional(),
      }),
    )
    .max(20),
});
export type NightDraft = z.infer<typeof nightDraftSchema>;
export const nightDraftKey = (userId: string) => `dwd-night-draft:v1:${userId}`;
export function readNightDraft(
  storage: Pick<Storage, 'getItem'>,
  userId: string,
): NightDraft | null {
  try {
    const parsed = nightDraftSchema.safeParse(
      JSON.parse(storage.getItem(nightDraftKey(userId)) ?? 'null'),
    );
    return parsed.success && parsed.data.userId === userId ? parsed.data : null;
  } catch {
    return null;
  }
}
