import 'expo-sqlite/localStorage/install';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dwd/core';

let client: SupabaseClient<Database> | null | undefined;

export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (client !== undefined) return client;

  const url = process.env['EXPO_PUBLIC_SUPABASE_URL'];
  const publishableKey = process.env['EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];

  if (!url || !publishableKey || url.includes('YOUR_') || publishableKey.includes('REPLACE_ME')) {
    client = null;
    return client;
  }

  client = createClient<Database>(url, publishableKey, {
    auth: {
      storage: globalThis.localStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  return client;
}
