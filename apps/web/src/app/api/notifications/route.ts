import { getMyNotificationEvents } from '@dwd/data';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  const headers = { 'Cache-Control': 'no-store, private' };
  try {
    const client = await createServerSupabaseClient();
    const { data, error } = await client.auth.getClaims();
    if (error || data?.claims.sub === undefined)
      return Response.json(
        { ok: false, error: 'Sign in to see notifications.' },
        { status: 401, headers },
      );
    return Response.json({ ok: true, data: await getMyNotificationEvents(client) }, { headers });
  } catch {
    return Response.json(
      { ok: false, error: 'Notifications could not refresh.' },
      { status: 503, headers },
    );
  }
}
