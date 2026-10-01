'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const displayNameInput = z.object({ displayName: z.string().trim().min(1).max(60) });

async function authenticatedClient() {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.auth.getClaims();
  if (error !== null || data?.claims.sub === undefined) throw new Error('Authentication required.');
  return client;
}

export async function scheduleAccountDeletionAction(
  input: unknown,
): Promise<{ ok: true; deleteAfter: string } | { ok: false; error: string }> {
  if (!z.object({ confirmed: z.literal(true) }).safeParse(input).success) {
    return { ok: false, error: 'Confirm that you want to delete your account.' };
  }
  try {
    const client = await authenticatedClient();
    const { data, error } = await client.rpc('schedule_account_deletion');
    if (error) throw error;
    const result = z.object({ deleteAfter: z.iso.datetime({ offset: true }) }).safeParse(data);
    if (!result.success) throw new Error('Deletion was not scheduled.');
    await client.auth.signOut({ scope: 'global' });
    revalidatePath('/account');
    return { ok: true, deleteAfter: result.data.deleteAfter };
  } catch {
    return { ok: false, error: 'Account deletion could not be scheduled. Retry when connected.' };
  }
}

export async function cancelAccountDeletionAction(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    const client = await authenticatedClient();
    const { error } = await client.rpc('cancel_account_deletion');
    if (error) throw error;
    revalidatePath('/account');
    return { ok: true };
  } catch {
    return { ok: false, error: 'Deletion could not be cancelled. It may already be in progress.' };
  }
}

export async function updateDisplayNameAction(
  input: unknown,
): Promise<{ ok: true; displayName: string } | { ok: false; error: string }> {
  const parsed = displayNameInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Use 1 to 60 characters for your display name.' };
  try {
    const client = await authenticatedClient();
    const { data, error } = await client.rpc('update_own_display_name', {
      p_display_name: parsed.data.displayName,
    });
    if (error) throw error;
    const result = data as { displayName?: string } | null;
    if (result?.displayName === undefined) throw new Error('Name was not saved.');
    return { ok: true, displayName: result.displayName };
  } catch {
    return { ok: false, error: 'Your name could not be saved. Retry without leaving this page.' };
  }
}
