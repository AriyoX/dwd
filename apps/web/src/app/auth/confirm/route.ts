import { type EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { safeReturnPath } from '@/lib/navigation';

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
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      verified = error === null;
    }
  } catch {
    /* Offer recovery without losing the invitation. */
  }
  if (verified) return NextResponse.redirect(new URL(next, request.url));
  const destination = new URL('/confirmation-help?error=confirmation', request.url);
  destination.searchParams.set('next', next);
  return NextResponse.redirect(destination);
}
