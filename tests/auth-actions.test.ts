import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  signInWithPassword: vi.fn(),
  verifyOtp: vi.fn(),
  rpc: vi.fn(),
  rememberConfirmation: vi.fn(),
  clearPendingConfirmation: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () =>
    Promise.resolve({
      auth: mocks,
      rpc: mocks.rpc,
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }),
    }),
}));
vi.mock('@/features/auth/pending-confirmation', () => ({
  rememberConfirmation: mocks.rememberConfirmation,
  clearPendingConfirmation: mocks.clearPendingConfirmation,
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
  loginAction,
  verifyConfirmationAction,
  completeSignupAction,
  isConfirmationComplete,
  continueAfterConfirmationAction,
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
    await expect(
      signupAction(
        {},
        form({
          email: 'CORRECT@example.com',
          password: 'sample-password',
          displayName: 'Alex',
          ageConfirmed: 'on',
          next,
        }),
      ),
    ).rejects.toThrow(`redirect:/confirmation-help?next=${encodeURIComponent(next)}`);
    expect(mocks.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'correct@example.com',
        options: {
          data: { display_name: 'Alex', age_confirmed: true },
          emailRedirectTo: `https://dwd.example/auth/confirm?next=${encodeURIComponent(next)}`,
        },
      }),
    );
    expect(mocks.rememberConfirmation).toHaveBeenCalledWith(
      'correct@example.com',
      expect.any(Number),
    );
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

describe('confirmation and Google onboarding', () => {
  it('continues only when this browser has the confirmed account', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { email: 'person@example.com', email_confirmed_at: '2026-09-16' } },
      error: null,
    });
    expect(await isConfirmationComplete('other@example.com')).toBe(false);
    await expect(
      continueAfterConfirmationAction(
        {},
        form({ email: 'person@example.com', next: '/join/saved' }),
      ),
    ).rejects.toThrow('redirect:/join/saved');
  });
  it('explains how to recover when the email link has not established a session here', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { code: 'session_missing' } });
    expect(
      (await continueAfterConfirmationAction({}, form({ email: 'person@example.com' }))).error,
    ).toContain('another device');
  });
  it('resumes unfinished onboarding after a successful sign-in', async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: 'id' } }, error: null });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(
      loginAction(
        {},
        form({ email: 'person@example.com', password: 'example-password', next: '/join/saved' }),
      ),
    ).rejects.toThrow('redirect:/complete-signup?next=%2Fjoin%2Fsaved');
  });
  it('takes an unconfirmed sign-in straight to its email step', async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: { code: 'email_not_confirmed' } });
    await expect(
      loginAction(
        {},
        form({ email: 'person@example.com', password: 'example-password', next: '/join/saved' }),
      ),
    ).rejects.toThrow('redirect:/confirmation-help?next=%2Fjoin%2Fsaved');
    expect(mocks.rememberConfirmation).toHaveBeenCalledWith('person@example.com');
  });
  it('verifies a signup code and continues to the invitation', async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null });
    await expect(
      verifyConfirmationAction(
        {},
        form({ email: 'PERSON@example.com', token: '123456', next: '/join/saved' }),
      ),
    ).rejects.toThrow('redirect:/join/saved');
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      email: 'person@example.com',
      token: '123456',
      type: 'signup',
    });
    expect(mocks.clearPendingConfirmation).toHaveBeenCalledOnce();
  });
  it('keeps an expired code recoverable and does not clear the pending signup', async () => {
    mocks.verifyOtp.mockResolvedValue({ error: { code: 'otp_expired' } });
    expect(
      (await verifyConfirmationAction({}, form({ email: 'person@example.com', token: '123456' })))
        .error,
    ).toContain('expired');
    expect(mocks.clearPendingConfirmation).not.toHaveBeenCalled();
  });
  it('rejects malformed codes without contacting Supabase', async () => {
    expect(
      (await verifyConfirmationAction({}, form({ email: 'person@example.com', token: '123' })))
        .error,
    ).toBeDefined();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
  it('rejects external return URLs after code verification', async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null });
    await expect(
      verifyConfirmationAction(
        {},
        form({ email: 'person@example.com', token: '12345678', next: '//untrusted.example' }),
      ),
    ).rejects.toThrow('redirect:/home');
  });
  it('requires explicit adult confirmation before creating a Google profile', async () => {
    expect((await completeSignupAction({}, form({ displayName: 'Person' }))).error).toContain('18');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('requires a verified session to finish onboarding', async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    expect(
      (await completeSignupAction({}, form({ displayName: 'Person', ageConfirmed: 'on' }))).error,
    ).toContain('expired');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('finishes Google onboarding and retains the invitation', async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: 'id' } }, error: null });
    mocks.rpc.mockResolvedValue({ error: null });
    await expect(
      completeSignupAction(
        {},
        form({ displayName: ' Person ', ageConfirmed: 'on', next: '/join/saved' }),
      ),
    ).rejects.toThrow('redirect:/join/saved');
    expect(mocks.rpc).toHaveBeenCalledWith('complete_signup', {
      p_display_name: 'Person',
      p_age_confirmed: true,
    });
  });
});
