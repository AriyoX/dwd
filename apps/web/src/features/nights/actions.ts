'use server';

import { z } from 'zod';
import {
  addManagedGuestSchema,
  endNightSchema,
  extendNightSchema,
  leaveNightSchema,
  removeManagedGuestSchema,
  replacePlanSchema,
  startNightSchema,
  type NightSnapshot,
  type StartNightInput,
} from '@dwd/core';
import {
  addManagedGuest,
  endNight,
  extendNight,
  getNightSnapshot,
  leaveNight,
  removeManagedGuest,
  replaceMemberPlan,
  startNightOut,
} from '@dwd/data';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createInviteAction } from '@/features/invites/actions';

export type NightActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

async function authenticatedClient() {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.auth.getClaims();
  if (error !== null || data?.claims.sub === undefined) throw new Error('Authentication required.');
  return client;
}

export async function startNightAction(
  input: StartNightInput,
  inviteToken?: string,
): Promise<
  NightActionResult<{ nightId: string; inviteUrl: string | null; inviteError: string | null }>
> {
  const parsed = startNightSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Check the highlighted night details.',
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  try {
    const client = await authenticatedClient();
    const created = await startNightOut(client, parsed.data);
    if (!parsed.data.withPeople) {
      return { ok: true, data: { nightId: created.nightId, inviteUrl: null, inviteError: null } };
    }
    const invite = await createInviteAction(created.nightId, false, inviteToken);
    return invite.ok
      ? {
          ok: true,
          data: { nightId: created.nightId, inviteUrl: invite.data.url, inviteError: null },
        }
      : {
          ok: true,
          data: { nightId: created.nightId, inviteUrl: null, inviteError: invite.error },
        };
  } catch {
    return {
      ok: false,
      error: 'Could not confirm whether the night started. Retry this setup to safely recover it.',
    };
  }
}

export async function getNightSnapshotAction(
  nightId: string,
): Promise<NightActionResult<NightSnapshot>> {
  try {
    const client = await authenticatedClient();
    return { ok: true, data: await getNightSnapshot(client, nightId) };
  } catch {
    return { ok: false, error: 'The night could not be refreshed.' };
  }
}

export async function replacePlanAction(input: unknown): Promise<NightActionResult<NightSnapshot>> {
  const parsed = replacePlanSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: 'Choose water only, or check your plan and quick-log drink.' };
  try {
    const client = await authenticatedClient();
    return {
      ok: true,
      data: await replaceMemberPlan(
        client,
        parsed.data.memberId,
        parsed.data.items,
        parsed.data.expectedRevision,
      ),
    };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      (('code' in error && error.code === '40001') ||
        ('message' in error && String(error.message).includes('plan changed')))
    ) {
      return {
        ok: false,
        error: 'This plan changed in another tab. Reload and review it before saving.',
      };
    }
    return { ok: false, error: 'You are not allowed to change this plan.' };
  }
}

export async function addGuestAction(input: unknown): Promise<NightActionResult<NightSnapshot>> {
  const parsed = addManagedGuestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Enter a guest name and valid plan.' };
  try {
    const client = await authenticatedClient();
    return {
      ok: true,
      data: await addManagedGuest(
        client,
        parsed.data.nightId,
        parsed.data.guest.displayName,
        parsed.data.guest.planItems,
      ),
    };
  } catch {
    return { ok: false, error: 'Only the host can add a managed guest.' };
  }
}

export async function removeGuestAction(input: unknown): Promise<NightActionResult<NightSnapshot>> {
  const parsed = removeManagedGuestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That managed guest is invalid.' };
  try {
    const client = await authenticatedClient();
    return { ok: true, data: await removeManagedGuest(client, parsed.data.memberId) };
  } catch {
    return { ok: false, error: 'Only the host can remove a managed guest.' };
  }
}

export async function extendNightAction(input: unknown): Promise<NightActionResult<NightSnapshot>> {
  const parsed = extendNightSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That extension is invalid.' };
  try {
    const client = await authenticatedClient();
    return { ok: true, data: await extendNight(client, parsed.data.nightId, parsed.data.minutes) };
  } catch {
    return { ok: false, error: 'Only the host can extend an active night within 24 hours.' };
  }
}

export async function endNightAction(input: unknown): Promise<NightActionResult<NightSnapshot>> {
  const parsed = endNightSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That night is invalid.' };
  try {
    const client = await authenticatedClient();
    return { ok: true, data: await endNight(client, parsed.data.nightId) };
  } catch {
    return { ok: false, error: 'Only the host can end this night.' };
  }
}

export async function leaveNightAction(input: unknown): Promise<NightActionResult<undefined>> {
  const parsed = leaveNightSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That night is invalid.' };
  try {
    const client = await authenticatedClient();
    await leaveNight(client, parsed.data.nightId);
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, error: 'The host cannot leave an active night.' };
  }
}
