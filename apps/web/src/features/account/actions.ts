'use server';

import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const displayNameInput = z.object({ displayName: z.string().trim().min(1).max(60) });

async function authenticatedClient() {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.auth.getClaims();
  if (error !== null || data?.claims.sub === undefined) throw new Error('Authentication required.');
  return client;
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
