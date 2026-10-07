import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  setSession: vi.fn(),
  getUser: vi.fn(),
  clearPendingConfirmation: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => Promise.resolve({ auth: mocks }),
}));
vi.mock('@/features/auth/pending-confirmation', () => ({
  clearPendingConfirmation: mocks.clearPendingConfirmation,
}));
import { GET, POST } from '../apps/web/src/app/auth/confirm/verify/route';

beforeEach(() => vi.resetAllMocks());
describe('email confirmation callbacks', () => {
  it('exchanges the code using its own flow and retains the invitation', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await GET(
      new NextRequest(
        'https://dwd.example/auth/confirm?code=latest&sb_flow_id=signup-flow&next=%2Fjoin%2Fsaved',
      ),
    );
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith('latest', { flowId: 'signup-flow' });
    expect(response.headers.get('location')).toBe('https://dwd.example/join/saved');
    expect(mocks.clearPendingConfirmation).toHaveBeenCalledOnce();
  });
  it('supports codes from older links without a flow ID', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await GET(new NextRequest('https://dwd.example/auth/confirm?code=older'));
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith('older', undefined);
    expect(response.headers.get('location')).toBe('https://dwd.example/home');
  });
  it('still verifies token-hash links and rejects external destinations', async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null });
    const response = await GET(
      new NextRequest(
        'https://dwd.example/auth/confirm?token_hash=hash&type=email&next=//evil.example',
      ),
    );
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash', type: 'email' });
    expect(response.headers.get('location')).toBe('https://dwd.example/home');
  });
  it('offers recovery when verification has no credentials', async () => {
    const response = await GET(
      new NextRequest('https://dwd.example/auth/confirm?next=%2Fjoin%2Fsaved'),
    );
    expect(response.headers.get('location')).toBe(
      'https://dwd.example/confirmation-help?error=confirmation&next=%2Fjoin%2Fsaved',
    );
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.clearPendingConfirmation).not.toHaveBeenCalled();
  });
  it('keeps expired reset links in the password recovery flow', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: { code: 'expired' } });
    const response = await GET(
      new NextRequest(
        'https://dwd.example/auth/confirm?code=expired&next=%2Freset-password%3Fnext%3D%252Fjoin%252Fsaved',
      ),
    );
    expect(response.headers.get('location')).toBe(
      'https://dwd.example/forgot-password?error=expired&next=%2Fjoin%2Fsaved',
    );
    expect(mocks.clearPendingConfirmation).not.toHaveBeenCalled();
  });
});

const tokens = { access_token: 'access', refresh_token: 'refresh' };
function handoff(body: unknown = tokens, origin = 'https://dwd.example') {
  return new NextRequest('https://dwd.example/auth/confirm', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
describe('email session handoff', () => {
  it('validates the session and confirmed identity before continuation', async () => {
    mocks.setSession.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({
      data: { user: { email_confirmed_at: '2026-10-07' } },
      error: null,
    });
    const response = await POST(handoff());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.setSession).toHaveBeenCalledWith(tokens);
    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(mocks.clearPendingConfirmation).toHaveBeenCalledOnce();
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it.each(['https://evil.example', 'null', ''])('rejects a handoff from %s', async (origin) => {
    expect((await POST(handoff(tokens, origin))).status).toBe(403);
    expect(mocks.setSession).not.toHaveBeenCalled();
  });
  it('rejects incomplete tokens', async () => {
    expect((await POST(handoff({ access_token: 'access' }))).status).toBe(400);
    expect(mocks.setSession).not.toHaveBeenCalled();
  });
  it('rejects invalid tokens without clearing pending signup', async () => {
    mocks.setSession.mockResolvedValue({ error: { code: 'bad_jwt' } });
    expect((await POST(handoff())).status).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.clearPendingConfirmation).not.toHaveBeenCalled();
  });
  it('does not continue an unconfirmed identity', async () => {
    mocks.setSession.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { email_confirmed_at: null } }, error: null });
    expect((await POST(handoff())).status).toBe(401);
    expect(mocks.clearPendingConfirmation).not.toHaveBeenCalled();
  });
});
