import { createClient } from '@supabase/supabase-js';
import type { Database } from '@dwd/core';

// Photos use Storage as well as RPCs. Freeze authorization for both, without
// sharing the app client's changing session or creating another persisted one.
export function photoClient(token: string, signal: AbortSignal) {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('DWD is unavailable. Try again.');
  return createClient<Database>(url, key, {
    accessToken: () => Promise.resolve(token),
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal }) },
  });
}
