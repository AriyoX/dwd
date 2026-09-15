import { z } from 'zod';
import { INPUT_LIMITS, MAX_NIGHT_DURATION_HOURS } from '../config/constants';
import { isValidIanaTimeZone } from '../time/time';

export const drinkCategorySchema = z.enum(['beer', 'wine', 'spirit', 'cocktail', 'other']);

const trimmedString = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label} is required.`).max(max, `${label} is too long.`);

export const displayNameSchema = trimmedString(
  INPUT_LIMITS.displayName.min,
  INPUT_LIMITS.displayName.max,
  'Display name',
);

export const signupSchema = z.object({
  displayName: displayNameSchema,
  email: z
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8, 'Use at least 8 characters.').max(128),
  ageConfirmed: z.literal(true, { error: 'You must confirm you are 18 or older.' }),
  next: z.string().optional(),
});

export const loginSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
  next: z.string().optional(),
});

export const planItemInputSchema = z.object({
  id: z.uuid().optional(),
  clientId: z.string().max(80).optional(),
  label: trimmedString(INPUT_LIMITS.label.min, INPUT_LIMITS.label.max, 'Drink label'),
  category: drinkCategorySchema,
  volumeMl: z
    .number()
    .refine(Number.isFinite, 'Volume must be a finite number.')
    .min(INPUT_LIMITS.volumeMl.min)
    .max(INPUT_LIMITS.volumeMl.max),
  abvPercent: z
    .number()
    .refine(Number.isFinite, 'ABV must be a finite number.')
    .positive()
    .max(INPUT_LIMITS.abvPercent.max),
  plannedQuantity: z
    .number()
    .int()
    .refine(Number.isFinite, 'Quantity must be a finite number.')
    .min(INPUT_LIMITS.plannedQuantity.min)
    .max(INPUT_LIMITS.plannedQuantity.max),
  isQuickLog: z.boolean(),
});

export const planItemsSchema = z
  .array(planItemInputSchema)
  .min(INPUT_LIMITS.planItems.min)
  .max(INPUT_LIMITS.planItems.max)
  .superRefine((items, context) => {
    if (items.length > 0 && items.filter((item) => item.isQuickLog).length !== 1) {
      context.addIssue({
        code: 'custom',
        message: 'Choose exactly one quick-log drink.',
      });
    }
  });

export const guestInputSchema = z.object({
  displayName: displayNameSchema,
  planItems: planItemsSchema,
});

export const startNightSchema = z
  .object({
    creationKey: z.uuid(),
    title: trimmedString(INPUT_LIMITS.title.min, INPUT_LIMITS.title.max, 'Title').default(
      'Tonight',
    ),
    endsAt: z.iso.datetime({ offset: true }),
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .refine(isValidIanaTimeZone, 'Choose a valid IANA time zone.'),
    withPeople: z.boolean(),
    hostPlanItems: planItemsSchema,
    guests: z.array(guestInputSchema).max(INPUT_LIMITS.guests.max),
  })
  .superRefine((input, context) => {
    const now = Date.now();
    const end = Date.parse(input.endsAt);
    if (end <= now) {
      context.addIssue({ code: 'custom', path: ['endsAt'], message: 'End time must be later.' });
    }
    if (end > now + MAX_NIGHT_DURATION_HOURS * 60 * 60 * 1000 + 60_000) {
      context.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'A night can last at most 24 hours.',
      });
    }
  });

export const customDrinkSchema = z.object({
  label: trimmedString(INPUT_LIMITS.label.min, INPUT_LIMITS.label.max, 'Drink label'),
  category: drinkCategorySchema,
  volumeMl: z
    .number()
    .refine(Number.isFinite, 'Volume must be a finite number.')
    .min(INPUT_LIMITS.volumeMl.min)
    .max(INPUT_LIMITS.volumeMl.max),
  abvPercent: z
    .number()
    .refine(Number.isFinite, 'ABV must be a finite number.')
    .positive()
    .max(INPUT_LIMITS.abvPercent.max),
});

export const drinkLogCommandSchema = z
  .object({
    targetMemberId: z.uuid(),
    planItemId: z.uuid().optional(),
    customDrink: customDrinkSchema.optional(),
    consumedAt: z.iso.datetime({ offset: true }),
    idempotencyKey: z.uuid(),
    acknowledgePlanExceeded: z.boolean().default(false),
    acknowledgeAfterEnd: z.boolean().default(false),
  })
  .superRefine((input, context) => {
    if ((input.planItemId === undefined) === (input.customDrink === undefined)) {
      context.addIssue({
        code: 'custom',
        message: 'Choose a plan item or provide one custom drink, not both.',
      });
    }
  });

export const waterLogCommandSchema = z.object({
  targetMemberId: z.uuid(),
  consumedAt: z.iso.datetime({ offset: true }),
  idempotencyKey: z.uuid(),
});

export const softDeleteLogSchema = z.object({
  logId: z.uuid(),
  kind: z.enum(['alcohol', 'water']),
});

export const replacePlanSchema = z.object({
  memberId: z.uuid(),
  items: planItemsSchema,
  expectedRevision: z.number().int().nonnegative().optional(),
});

export const inviteTokenSchema = z
  .string()
  .min(32)
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/);

export const createInviteSchema = z.object({
  nightId: z.uuid(),
  expiresInHours: z.number().int().min(1).max(168).default(24),
  maxUses: z.number().int().min(1).max(100).nullable().default(null),
});

export const extendNightSchema = z.object({
  nightId: z.uuid(),
  minutes: z.number().int().min(5).max(120),
});

export const endNightSchema = z.object({ nightId: z.uuid() });
export const addManagedGuestSchema = z.object({
  nightId: z.uuid(),
  guest: guestInputSchema,
});
export const removeManagedGuestSchema = z.object({ memberId: z.uuid() });
export const leaveNightSchema = z.object({ nightId: z.uuid() });

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type StartNightInput = z.infer<typeof startNightSchema>;
export type ReplacePlanInput = z.infer<typeof replacePlanSchema>;
export type AddManagedGuestInput = z.infer<typeof addManagedGuestSchema>;
