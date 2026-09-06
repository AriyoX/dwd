import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@dwd/core';
import { getSupabaseEnvironment } from './env';

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const environment = getSupabaseEnvironment();

  return createServerClient<Database>(environment.url, environment.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. proxy.ts refreshes sessions first.
        }
      },
    },
  });
}

export async function getAuthenticatedUserId(): Promise<string | null> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.auth.getClaims();
  if (error !== null || data?.claims.sub === undefined) return null;
  return data.claims.sub;
}

export async function requireAuthenticatedUserId(): Promise<string> {
  const userId = await getAuthenticatedUserId();
  if (userId === null) throw new Error('Authentication required.');
  return userId;
}
