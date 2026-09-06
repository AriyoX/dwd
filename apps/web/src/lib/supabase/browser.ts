'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dwd/core';
import { getSupabaseEnvironment } from './env';

let browserClient: SupabaseClient<Database> | undefined;

export function createBrowserSupabaseClient() {
  if (browserClient !== undefined) return browserClient;
  const environment = getSupabaseEnvironment();
  browserClient = createBrowserClient<Database>(environment.url, environment.publishableKey);
  return browserClient;
}
