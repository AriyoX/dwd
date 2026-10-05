import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dwd/core';

// Freeze authorization at the action boundary rather than reading a later account's token.
export function actorClient(
  client: SupabaseClient<Database>,
  accessToken: string,
  signal?: AbortSignal,
) {
  const scoped = Object.create(client) as SupabaseClient<Database>;
  scoped.rpc = (fn, args, options) => {
    const request = client
      .rpc(fn, args, options)
      .setHeader('Authorization', `Bearer ${accessToken}`);
    return signal ? request.abortSignal(signal) : request;
  };
  return scoped;
}
