import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ exchangeCodeForSession: vi.fn(), maybeSingle: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () =>
    Promise.resolve({
      auth: { exchangeCodeForSession: mocks.exchangeCodeForSession },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }),
    }),
}));
import { GET } from '../apps/web/src/app/auth/callback/route';

beforeEach(() => vi.resetAllMocks());
describe('Google callback', () => {
  it('establishes a session and returns an existing account to the invitation', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ data: { user: { id: 'id' } }, error: null });
    mocks.maybeSingle.mockResolvedValue({ data: { id: 'id' }, error: null });
    const response = await GET(
      new NextRequest('https://dwd.example/auth/callback?code=single-use&next=%2Fjoin%2Fsaved'),
    );
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith('single-use');
    expect(response.headers.get('location')).toBe('https://dwd.example/join/saved');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('requires onboarding for new Google accounts', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ data: { user: { id: 'id' } }, error: null });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    const response = await GET(
      new NextRequest('https://dwd.example/auth/callback?code=single-use&next=%2Fjoin%2Fsaved'),
    );
    expect(response.headers.get('location')).toBe(
      'https://dwd.example/complete-signup?next=%2Fjoin%2Fsaved',
    );
  });
  it('recovers from cancellation without forwarding provider messages', async () => {
    const response = await GET(
      new NextRequest(
        'https://dwd.example/auth/callback?error=access_denied&error_description=private&next=%2Fjoin%2Fsaved',
      ),
    );
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe(
      'https://dwd.example/login?error=google&next=%2Fjoin%2Fsaved',
    );
  });
  it('rejects off-site destinations and handles expired codes', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ data: {}, error: { code: 'expired' } });
    const response = await GET(
      new NextRequest('https://dwd.example/auth/callback?code=expired&next=//evil.example'),
    );
    expect(response.headers.get('location')).toBe(
      'https://dwd.example/login?error=google&next=%2Fhome',
    );
  });
});
