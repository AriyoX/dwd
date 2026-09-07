import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => Promise.resolve({ auth: mocks }),
}));
vi.mock('@/lib/supabase/env', () => ({ getSiteUrl: () => 'https://dwd.example' }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

import {
  signupAction,
  resendConfirmationAction,
  requestPasswordResetAction,
  updatePasswordAction,
} from '../apps/web/src/features/auth/actions';

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('password recovery', () => {
  it('preserves the invitation through the email callback and password reset', async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
    const next = `/join/${'a'.repeat(43)}`;
    const result = await requestPasswordResetAction(
      {},
      form({ email: 'person@example.com', next }),
    );
    const resetPath = `/reset-password?next=${encodeURIComponent(next)}`;
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith('person@example.com', {
      redirectTo: `https://dwd.example/auth/confirm?next=${encodeURIComponent(resetPath)}`,
    });
    expect(result.success).toContain('If an account');
  });
  it('does not send a reset for an invalid email', async () => {
    expect((await requestPasswordResetAction({}, form({ email: 'invalid' }))).error).toBeDefined();
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });
  it('recovers from a network failure without exposing the provider error', async () => {
    mocks.resetPasswordForEmail.mockRejectedValue(new Error('provider internals'));
    const result = await requestPasswordResetAction({}, form({ email: 'person@example.com' }));
    expect(result.error).toBe('Couldn’t connect. Please try again.');
  });
  it('requires validated identity before changing a password', async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    const result = await updatePasswordAction({}, form({ password: 'long-enough-example' }));
    expect(result.error).toContain('expired');
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it('rejects short passwords before accessing the account', async () => {
    expect((await updatePasswordAction({}, form({ password: 'short' }))).error).toBeDefined();
    expect(mocks.getClaims).not.toHaveBeenCalled();
  });
  it('signs out after updating and rejects external return URLs', async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: 'account-id' } }, error: null });
    mocks.updateUser.mockResolvedValue({ error: null });
    mocks.signOut.mockResolvedValue({ error: null });
    await expect(
      updatePasswordAction(
        {},
        form({ password: 'long-enough-example', next: '//untrusted.example' }),
      ),
    ).rejects.toThrow('redirect:/login?updated=1&next=%2Fhome');
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'long-enough-example' });
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
});

describe('signup confirmation recovery', () => {
  it('keeps the invitation after signup with no session and provides an email and cooldown', async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
    const next = `/join/${'b'.repeat(43)}`;
    const result = await signupAction(
      {},
      form({
        email: 'CORRECT@example.com',
        password: 'sample-password',
        displayName: 'Alex',
        ageConfirmed: 'on',
        next,
      }),
    );
    expect(mocks.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'correct@example.com',
        options: {
          data: { display_name: 'Alex', age_confirmed: true },
          emailRedirectTo: `https://dwd.example/auth/confirm?next=${encodeURIComponent(next)}`,
        },
      }),
    );
    expect(result.email).toBe('correct@example.com');
    expect(result.retryAt).toBeGreaterThan(Date.now());
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it('resends signup confirmation with the same invitation and a neutral success message', async () => {
    mocks.resend.mockResolvedValue({ error: null });
    const next = `/join/${'c'.repeat(43)}`;
    const result = await resendConfirmationAction({}, form({ email: 'resend@example.com', next }));
    expect(mocks.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'resend@example.com',
      options: {
        emailRedirectTo: `https://dwd.example/auth/confirm?next=${encodeURIComponent(next)}`,
      },
    });
    expect(result.success).toContain('If this email');
    expect(
      (await resendConfirmationAction({}, form({ email: 'resend@example.com', next }))).retryAt,
    ).toBeDefined();
    expect(mocks.resend).toHaveBeenCalledOnce();
  });
  it('recovers from failed delivery without dropping the invitation', async () => {
    mocks.resend.mockRejectedValue(new Error('network'));
    const result = await resendConfirmationAction(
      {},
      form({ email: 'failed@example.com', next: '/join/preserved' }),
    );
    expect(result.error).toContain('invitation is preserved');
    expect(result.retryAt).toBeGreaterThan(Date.now());
  });
});
