import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@dwd/core';

const protectedPrefixes = ['/home', '/night', '/history', '/account', '/feedback'];

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  if (request.nextUrl.pathname === '/demo') return NextResponse.next({ request });
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];

  if (url === undefined || key === undefined) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const isProtected = protectedPrefixes.some((prefix) =>
    request.nextUrl.pathname.startsWith(prefix),
  );

  if (isProtected && data?.claims.sub === undefined) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if ((isProtected || request.nextUrl.pathname.startsWith('/join/')) && data?.claims.sub) {
    const profile = await supabase
      .from('profiles')
      .select('id')
      .eq('id', data.claims.sub)
      .maybeSingle();
    if (!profile.error && !profile.data) {
      const destination = new URL('/complete-signup', request.url);
      destination.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
      const onboarding = NextResponse.redirect(destination);
      for (const cookie of response.cookies.getAll()) onboarding.cookies.set(cookie);
      onboarding.headers.set('Cache-Control', 'private, no-store');
      return onboarding;
    }
  }

  if (isProtected || data?.claims.sub !== undefined) {
    response.headers.set('Cache-Control', 'private, no-store');
  }
  return response;
}
