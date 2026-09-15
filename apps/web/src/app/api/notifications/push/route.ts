import { createServerSupabaseClient } from '@/lib/supabase/server';

// The worker checks the current cookie-backed account before displaying a queued
// push. An unverified event receives only the worker's generic fallback.
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store, private' };
  const id = new URL(request.url).searchParams.get('id');
  if (id === null || !/^[0-9a-f-]{36}$/i.test(id))
    return new Response(null, { status: 400, headers });
  const client = await createServerSupabaseClient();
  const { data: auth, error: authError } = await client.auth.getClaims();
  if (authError || auth?.claims.sub === undefined)
    return new Response(null, { status: 401, headers });
  const { data, error } = await client.rpc('can_display_notification', { p_event_id: id });
  if (error || !data) return new Response(null, { status: 404, headers });
  return new Response(null, { status: 204, headers });
}
