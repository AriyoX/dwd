import 'expo-sqlite/localStorage/install';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dwd/core';

let client: SupabaseClient<Database> | null | undefined;

export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (client !== undefined) return client;

  // Expo only inlines EXPO_PUBLIC variables accessed with static dot notation.
  const url: unknown = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey: unknown = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (
    typeof url !== 'string' ||
    typeof publishableKey !== 'string' ||
    !url ||
    !publishableKey ||
    url.includes('YOUR_') ||
    publishableKey.includes('REPLACE_ME')
  ) {
    client = null;
    return client;
  }

  client = createClient<Database>(url, publishableKey, {
    auth: {
      storage: globalThis.localStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });

  return client;
}
