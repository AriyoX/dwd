import { z } from 'zod';
import {
  planItemInputSchema,
  resolveWallTimeInTimeZone,
  startNightSchema,
  wallClockFromInstant,
  type StartNightInput,
} from '@dwd/core';

const mode = z.enum(['unselected', 'drinks', 'water_only']);
const guest = z.object({
  clientId: z.uuid(),
  displayName: z.string().max(60),
  mode,
  items: z.array(planItemInputSchema).max(20),
  consent: z.boolean(),
});
export const nightDraftSchema = z.object({
  version: z.literal(1),
  owner: z.uuid(),
  creationKey: z.uuid(),
  step: z.number().int().min(1).max(3),
  title: z.string().max(80),
  date: z.string(),
  time: z.string(),
  timezone: z.string().max(80),
  durationHours: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
    .nullable()
    .default(null),
  withPeople: z.boolean(),
  mode,
  items: z.array(planItemInputSchema).max(20),
  guests: z.array(guest).max(20),
  attempt: z.object(startNightSchema.shape).nullable(),
});
export type NightDraft = z.infer<typeof nightDraftSchema>;
export const nightDraftKey = (owner: string) => `dwd.mobile.night-draft.v1:${owner}`;
export function newNightDraft(owner: string, creationKey: string, now = Date.now()): NightDraft {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return {
    version: 1,
    owner,
    creationKey,
    step: 1,
    title: 'Tonight',
    ...wallClockFromInstant(new Date(now + 2 * 3_600_000), timezone),
    timezone,
    durationHours: 2,
    withPeople: true,
    mode: 'unselected',
    items: [],
    guests: [],
    attempt: null,
  };
}
export function readNightDraft(storage: Pick<Storage, 'getItem'>, owner: string) {
  const raw = storage.getItem(nightDraftKey(owner));
  if (!raw) return null;
  const parsed = nightDraftSchema.safeParse(JSON.parse(raw));
  if (!parsed.success || parsed.data.owner !== owner)
    throw new Error('Could not restore this setup.');
  return parsed.data;
}
export function materializeNightDraft(draft: NightDraft): StartNightInput {
  if (draft.mode === 'unselected' || (draft.mode === 'drinks' && !draft.items.length))
    throw new Error('Choose your plan.');
  const guests = draft.withPeople
    ? draft.guests.map((guest) => {
        if (!guest.consent)
          throw new Error(
            `Confirm ${guest.displayName || 'your guest'} agreed to host-managed logging.`,
          );
        if (guest.mode === 'unselected' || (guest.mode === 'drinks' && !guest.items.length))
          throw new Error(`Choose a plan for ${guest.displayName || 'your guest'}.`);
        return {
          displayName: guest.displayName,
          planItems: guest.mode === 'water_only' ? [] : guest.items,
        };
      })
    : [];
  const parsed = startNightSchema.safeParse({
    creationKey: draft.creationKey,
    title: draft.title,
    endsAt: resolveWallTimeInTimeZone(draft.date, draft.time, draft.timezone),
    timezone: draft.timezone,
    withPeople: draft.withPeople,
    hostPlanItems: draft.mode === 'water_only' ? [] : draft.items,
    guests,
  });
  if (!parsed.success)
    throw new Error(parsed.error.issues[0]?.message ?? 'Check the night details.');
  return parsed.data;
}
