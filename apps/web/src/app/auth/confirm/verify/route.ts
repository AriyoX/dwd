import { type EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { safeReturnPath } from '@/lib/navigation';
import { clearPendingConfirmation } from '@/features/auth/pending-confirmation';
import { z } from 'zod';

function recoveryDestination(next: string, requestUrl: string) {
  if (next.startsWith('/reset-password')) {
    const destination = new URL('/forgot-password?error=expired', requestUrl);
    destination.searchParams.set(
      'next',
      safeReturnPath(new URL(next, requestUrl).searchParams.get('next')),
    );
    return destination;
  }
  const destination = new URL('/confirmation-help?error=confirmation', requestUrl);
  destination.searchParams.set('next', next);
  return destination;
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type') as EmailOtpType | null;
  const code = request.nextUrl.searchParams.get('code');
  const next = safeReturnPath(request.nextUrl.searchParams.get('next'));

  let verified = false;
  try {
    const supabase = await createServerSupabaseClient();
    if (tokenHash !== null && type !== null) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      verified = error === null;
    } else if (code !== null) {
      const flowId = request.nextUrl.searchParams.get('sb_flow_id');
      const { error } = await supabase.auth.exchangeCodeForSession(
        code,
        flowId ? { flowId } : undefined,
      );
      verified = error === null;
    }
  } catch {
    /* Offer recovery without losing the invitation. */
  }
  if (verified) {
    await clearPendingConfirmation();
    const response = NextResponse.redirect(new URL(next, request.url));
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
  const response = NextResponse.redirect(recoveryDestination(next, request.url));
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

const sessionSchema = z.object({
  access_token: z.string().min(1).max(16384),
  refresh_token: z.string().min(1).max(4096),
});

export async function POST(request: NextRequest) {
  const reply = (ok: boolean, status: number) =>
    NextResponse.json({ ok }, { status, headers: { 'Cache-Control': 'private, no-store' } });
  // This endpoint writes session cookies: only our own handoff page may call it.
  if (request.headers.get('origin') !== request.nextUrl.origin) return reply(false, 403);
  try {
    const parsed = sessionSchema.safeParse(await request.json());
    if (!parsed.success) return reply(false, 400);
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.setSession(parsed.data);
    if (error) return reply(false, 401);
    const { data, error: userError } = await supabase.auth.getUser();
    if (userError || !data.user.email_confirmed_at) return reply(false, 401);
    await clearPendingConfirmation();
    return reply(true, 200);
  } catch {
    return reply(false, 400);
  }
}
