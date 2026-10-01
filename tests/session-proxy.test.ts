import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  maybeSingle: vi.fn(),
  cookies: undefined as
    | {
        setAll: (
          cookies: { name: string; value: string; options: CookieOptions }[],
          headers: Record<string, string>,
        ) => void;
      }
    | undefined,
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: typeof mocks.cookies }) => {
    mocks.cookies = options.cookies;
    return {
      auth: { getClaims: mocks.getClaims },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }),
    };
  },
}));

import { updateSession } from '../apps/web/src/lib/supabase/proxy';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:55321');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'local-test-key');
  mocks.getClaims.mockResolvedValue({ data: null, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe('session redirects', () => {
  it('clears expired cookies on the login redirect and preserves the destination', async () => {
    mocks.getClaims.mockImplementation(() => {
      mocks.cookies?.setAll(
        [{ name: 'sb-session', value: '', options: { path: '/', maxAge: 0 } }],
        {},
      );
      return Promise.resolve({ data: null, error: { message: 'Expired session' } });
    });
    const response = await updateSession(new NextRequest('https://dwd.example/home?tour=start'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://dwd.example/login?next=%2Fhome%3Ftour%3Dstart',
    );
    expect(response.cookies.get('sb-session')).toMatchObject({ value: '', maxAge: 0, path: '/' });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('retains refreshed cookies when redirecting a new account to onboarding', async () => {
    mocks.getClaims.mockImplementation(() => {
      mocks.cookies?.setAll(
        [
          {
            name: 'sb-session',
            value: 'refreshed-test-session',
            options: { path: '/', httpOnly: true },
          },
        ],
        {},
      );
      return Promise.resolve({ data: { claims: { sub: 'user-id' } }, error: null });
    });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    const response = await updateSession(new NextRequest('https://dwd.example/home'));
    expect(response.headers.get('location')).toBe(
      'https://dwd.example/complete-signup?next=%2Fhome',
    );
    expect(response.cookies.get('sb-session')).toMatchObject({
      value: 'refreshed-test-session',
      httpOnly: true,
    });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('lets an existing account reach Home', async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: 'user-id' } }, error: null });
    mocks.maybeSingle.mockResolvedValue({ data: { id: 'user-id' }, error: null });
    const response = await updateSession(new NextRequest('https://dwd.example/home'));
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('protects nested routes without matching unrelated route names', async () => {
    expect((await updateSession(new NextRequest('https://dwd.example/night/new'))).status).toBe(
      307,
    );
    expect((await updateSession(new NextRequest('https://dwd.example/nightlife'))).status).toBe(
      200,
    );
  });
});
