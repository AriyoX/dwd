'use server';

import { z } from 'zod';
import { sharedBottleInputSchema, type NightSnapshot } from '@dwd/core';
import {
  shareBottleAndPlan,
  planSharedBottle,
  setBottleMembership,
  closeSharedBottle,
} from '@dwd/data';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { NightActionResult } from '@/features/nights/actions';

const commandSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('create'),
    nightId: z.uuid(),
    bottle: sharedBottleInputSchema,
    memberId: z.uuid(),
    expectedRevision: z.number().int().min(0),
    requestKey: z.uuid(),
    makeMain: z.boolean(),
    creatorExpectedRevision: z.number().int().min(0),
    creatorMakeMain: z.boolean(),
  }),
  z.object({
    kind: z.literal('plan'),
    bottleId: z.uuid(),
    memberId: z.uuid(),
    quantity: z.number().int().min(1).max(50),
    servingMl: z.number().min(1).max(2000),
    expectedRevision: z.number().int().min(0),
    requestKey: z.uuid(),
    makeMain: z.boolean(),
  }),
  z.object({
    kind: z.literal('membership'),
    bottleId: z.uuid(),
    memberId: z.uuid(),
    join: z.boolean(),
  }),
  z.object({ kind: z.literal('close'), bottleId: z.uuid() }),
]);

export async function sharedBottleAction(
  input: unknown,
): Promise<NightActionResult<NightSnapshot>> {
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the bottle details.' };
  try {
    const client = await createServerSupabaseClient();
    const { data, error } = await client.auth.getClaims();
    if (error || !data?.claims.sub) return { ok: false, error: 'Sign in again to share a bottle.' };
    const command = parsed.data;
    const snapshot =
      command.kind === 'create'
        ? await shareBottleAndPlan(
            client,
            command.nightId,
            command.bottle,
            command.memberId,
            command.expectedRevision,
            command.requestKey,
            {
              makeMain: command.makeMain,
              creatorExpectedRevision: command.creatorExpectedRevision,
              creatorMakeMain: command.creatorMakeMain,
            },
          )
        : command.kind === 'plan'
          ? await planSharedBottle(
              client,
              command.bottleId,
              command.memberId,
              command.quantity,
              command.servingMl,
              command.expectedRevision,
              command.requestKey,
              command.makeMain,
            )
          : command.kind === 'membership'
            ? await setBottleMembership(client, command.bottleId, command.memberId, command.join)
            : await closeSharedBottle(client, command.bottleId);
    return { ok: true, data: snapshot };
  } catch (error) {
    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : '';
    const known = [
      'Bottle unavailable.',
      'Choose people from this night.',
      'Remove this bottle from your plan before leaving.',
      'Only the person sharing this bottle can put it away.',
      'This bottle is for selected people.',
      'This night has ended.',
      'Your plan changed. Close this window and try again.',
      'Your own plan changed. Close this window and try again.',
      'This bottle is already shared. Join or adjust it instead.',
      'This request belongs to another bottle.',
      'Check the drink size.',
      'Choose between 1 and 50 drinks.',
    ];
    if (message.includes('below activity already logged'))
      return {
        ok: false,
        error:
          'Your plan needs to cover the drinks already logged. Choose a higher number or adjust your full plan.',
      };
    if (message.includes('between 0 and 20 items'))
      return {
        ok: false,
        error: 'A plan is full. Remove a drink from it before adding another bottle.',
      };
    return {
      ok: false,
      error: known.includes(message)
        ? message
        : 'Could not save that change. Check your connection and try again.',
    };
  }
}
