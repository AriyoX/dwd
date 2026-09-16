import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { safeReturnPath } from '@/lib/navigation';

export async function GET(request: NextRequest) {
  const next = safeReturnPath(request.nextUrl.searchParams.get('next'));
  const code = request.nextUrl.searchParams.get('code');
  let destination = `/login?error=google&next=${encodeURIComponent(next)}`;
  try {
    if (code && !request.nextUrl.searchParams.has('error')) {
      const client = await createServerSupabaseClient();
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (!error) {
        const profile = await client
          .from('profiles')
          .select('id')
          .eq('id', data.user.id)
          .maybeSingle();
        if (!profile.error)
          destination = profile.data ? next : `/complete-signup?next=${encodeURIComponent(next)}`;
      }
    }
  } catch {
    // Keep the destination when Google is cancelled or the code cannot be exchanged.
  }
  const response = NextResponse.redirect(new URL(destination, request.url));
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
