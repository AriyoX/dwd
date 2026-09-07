'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function rememberTourAction(): Promise<boolean> {
  try {
    const client = await createServerSupabaseClient();
    const { data, error } = await client.auth.getUser();
    if (error) return false;
    if (data.user.user_metadata['tour_seen'] === true) return true;
    // This is a display preference, never an authorization claim.
    const result = await client.auth.updateUser({ data: { tour_seen: true } });
    return result.error === null;
  } catch {
    return false;
  }
}
