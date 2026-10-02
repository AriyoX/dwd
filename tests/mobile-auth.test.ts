import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AuthHandoff,
  authCallbackUrl,
  nativeLinkDestination,
  safeDestination,
} from '../apps/mobile/src/lib/auth-state';
import {
  confirmCode,
  emailSignIn,
  emailSignUp,
  exchangeAuthCallback,
  exchangeAuthCallbackOnce,
  finishProfile,
  googleSignIn,
  requestRecovery,
  resendConfirmation,
  resetPassword,
  signOutAuth,
  type AuthClient,
} from '../apps/mobile/src/lib/auth-actions';

const token = 'a'.repeat(43);
const destination = `/join?token=${token}`;
const callback = 'dwd://auth/callback?flow=signup';
function store(now = Date.now) {
  const data = new Map<string, string>();
  return new AuthHandoff(
    {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
      removeItem: (key) => {
        data.delete(key);
      },
    },
    now,
  );
}
const auth = {
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
  verifyOtp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  signInWithOAuth: vi.fn(),
};
const rpc = vi.fn();
const client = { auth, rpc } as unknown as AuthClient;
beforeEach(() => {
  vi.resetAllMocks();
});

describe('native auth handoff', () => {
  it('preserves invitation destinations through confirmation and consumes them once', () => {
    const handoff = store();
    handoff.remember(destination);
    handoff.confirmation('PERSON@example.com', 100);
    expect(handoff.read()).toMatchObject({ next: destination, email: 'person@example.com' });
    expect(handoff.consume()).toBe(destination);
    expect(handoff.consume()).toBe('/');
  });
  it('survives a fresh instance and expires old invitations and email state', () => {
    let clock = 1000;
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
    };
    new AuthHandoff(storage, () => clock).remember(destination);
    expect(new AuthHandoff(storage, () => clock).read().next).toBe(destination);
    clock += 25 * 60 * 60 * 1000;
    expect(new AuthHandoff(storage, () => clock).read().next).toBe('/');
    expect(data.size).toBe(0);
  });
  it('clears destinations, confirmation email and cooldown for explicit sign-out', () => {
    const handoff = store();
    handoff.remember(destination);
    handoff.confirmation('old@example.com', Date.now() + 60_000);
    handoff.clear();
    expect(handoff.read()).toMatchObject({ next: '/', email: '', retryAt: 0 });
  });
  it('rejects external, encoded and arbitrary return destinations', () => {
    const handoff = store();
    handoff.remember(destination);
    for (const path of [
      '//evil.example',
      'https://evil.example',
      '/auth?next=//evil',
      '/join?token=short',
      '/%2f%2fevil',
      '/night/../../auth',
    ]) {
      expect(safeDestination(path)).toBe('/');
      handoff.remember(path);
      expect(handoff.read().next).toBe(destination);
    }
    handoff.remember('/');
    expect(handoff.read().next).toBe('/');
  });
  it('routes cold-start web and app invitations into the native join flow', () => {
    for (const link of [
      `https://dwdug.vercel.app/join/${token}`,
      `https://dwdug.vercel.app/?join=${token}`,
      `dwd://join/${token}`,
      `dwd:///join?token=${token}`,
    ])
      expect(nativeLinkDestination(link)).toBe(destination);
    expect(nativeLinkDestination(`ftp://example.com/join/${token}`)).toBe('/');
    expect(nativeLinkDestination('dwd://auth/callback?code=secret&flow=recovery')).toBe(
      '/auth/callback?code=secret&flow=recovery',
    );
  });
});

describe('native development links', () => {
  it('preserves supported native and Expo development destinations', () => {
    expect(nativeLinkDestination('dwd:///auth?mode=signup')).toBe('/auth?mode=signup');
    expect(nativeLinkDestination('exp://127.0.0.1:8082/--/auth?mode=signup')).toBe(
      '/auth?mode=signup',
    );
    expect(nativeLinkDestination('dwd://history')).toBe('/history');
    expect(nativeLinkDestination('dwd://unknown')).toBe('/');
  });
});

describe('native account flows', () => {
  it('uses the configured, stable callback scheme for email and Google, with a safe destination', () => {
    for (const flow of ['signup', 'recovery', 'google'] as const) {
      const url = new URL(authCallbackUrl(destination, flow));
      expect(`${url.protocol}//${url.host}${url.pathname}`).toBe('dwd://auth/callback');
      expect(url.searchParams.get('next')).toBe(destination);
      expect(url.searchParams.get('flow')).toBe(flow);
    }
    expect(
      new URL(authCallbackUrl('https://evil.example', 'google')).searchParams.get('next'),
    ).toBe('/');
  });
  it('opens Google in the authentication browser and forwards a valid native callback', async () => {
    auth.signInWithOAuth.mockResolvedValue({
      data: { url: 'https://auth.example/authorize' },
      error: null,
    });
    const redirect = authCallbackUrl(destination, 'google');
    const browser = vi.fn().mockResolvedValue({ type: 'success', url: `${redirect}&code=private` });
    const result = await googleSignIn(client, redirect, browser);
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: redirect, skipBrowserRedirect: true },
    });
    expect(browser).toHaveBeenCalledWith('https://auth.example/authorize', redirect);
    expect(result).toContain('/auth/callback?');
    expect(new URL(result ?? '/', 'dwd:///').searchParams.get('next')).toBe(destination);
  });
  it('stops Google in Expo Go before creating an OAuth request or opening a browser', async () => {
    const browser = vi.fn();
    await expect(googleSignIn(client, callback, browser, true)).rejects.toThrow(
      'installed DWD build',
    );
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(browser).not.toHaveBeenCalled();
  });
  it('treats Google cancellation and dismissal as recoverable without consuming the invite', async () => {
    auth.signInWithOAuth.mockResolvedValue({
      data: { url: 'https://auth.example/authorize' },
      error: null,
    });
    const handoff = store();
    handoff.remember(destination);
    for (const type of ['cancel', 'dismiss']) {
      expect(await googleSignIn(client, callback, vi.fn().mockResolvedValue({ type }))).toBeNull();
      expect(handoff.read().next).toBe(destination);
    }
  });
  it('rejects unavailable Google providers and unexpected browser return destinations', async () => {
    const browser = vi.fn();
    auth.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: { message: 'disabled' } });
    await expect(googleSignIn(client, callback, browser)).rejects.toThrow('unavailable');
    expect(browser).not.toHaveBeenCalled();
    auth.signInWithOAuth.mockResolvedValue({
      data: { url: 'https://auth.example/authorize' },
      error: null,
    });
    for (const url of ['https://evil.example/auth/callback?code=x', 'dwd:///night/new', undefined])
      await expect(
        googleSignIn(client, callback, vi.fn().mockResolvedValue({ type: 'success', url })),
      ).rejects.toThrow('return to the app');
  });
  it('coalesces concurrent callback mounts and revalidates a later replay', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'actor' } } },
      error: null,
    });
    const first = exchangeAuthCallbackOnce(
      client,
      new URLSearchParams('code=single&flow=recovery'),
    );
    const second = exchangeAuthCallbackOnce(
      client,
      new URLSearchParams('flow=recovery&code=single'),
    );
    expect(first).toBe(second);
    await Promise.all([first, second]);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: { code: 'expired' },
    });
    await expect(
      exchangeAuthCallbackOnce(client, new URLSearchParams('code=single&flow=recovery')),
    ).rejects.toThrow('expired');
    expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(2);
  });
  it('requires explicit age confirmation before signup or completing a profile', async () => {
    await expect(
      emailSignUp(
        client,
        {
          email: 'person@example.com',
          password: 'long-password',
          displayName: 'Alex',
          ageConfirmed: false,
        },
        callback,
        store(),
      ),
    ).rejects.toThrow('18');
    await expect(finishProfile(client, 'Alex', false)).rejects.toThrow('18');
    expect(auth.signUp).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('uses the shared signup validation and keeps the invitation when email confirmation is needed', async () => {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    const handoff = store();
    handoff.remember(destination);
    expect(
      await emailSignUp(
        client,
        {
          email: 'PERSON@example.com',
          password: 'long-password',
          displayName: ' Alex ',
          ageConfirmed: true,
        },
        callback,
        handoff,
      ),
    ).toBe('confirm');
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'person@example.com',
      password: 'long-password',
      options: { data: { display_name: 'Alex', age_confirmed: true }, emailRedirectTo: callback },
    });
    expect(handoff.read().next).toBe(destination);
    expect(handoff.read().retryAt).toBeGreaterThan(Date.now());
  });
  it('sends an unconfirmed sign-in to confirmation without losing the invite', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { code: 'email_not_confirmed' } });
    const handoff = store();
    handoff.remember(destination);
    expect(await emailSignIn(client, 'PERSON@example.com', 'long-password', handoff)).toBe(
      'confirm',
    );
    expect(handoff.read()).toMatchObject({ next: destination, email: 'person@example.com' });
  });
  it('persists the resend cooldown across failures and keeps neutral success copy', async () => {
    const handoff = store();
    handoff.remember(destination);
    auth.resend.mockResolvedValue({ error: null });
    expect(await resendConfirmation(client, 'person@example.com', callback, handoff)).toContain(
      'If this email',
    );
    await expect(
      resendConfirmation(client, 'person@example.com', callback, handoff),
    ).rejects.toThrow('Wait');
    expect(auth.resend).toHaveBeenCalledTimes(1);
    expect(handoff.read().next).toBe(destination);
  });
  it('validates confirmation codes and leaves expired codes recoverable', async () => {
    await expect(confirmCode(client, 'person@example.com', '123')).rejects.toThrow('latest email');
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    auth.verifyOtp.mockResolvedValue({ error: { code: 'otp_expired' } });
    await expect(confirmCode(client, 'person@example.com', '123456')).rejects.toThrow('expired');
  });
  it('uses the native recovery callback and a neutral response', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    expect(
      await requestRecovery(client, 'person@example.com', `${callback}&flow=recovery`),
    ).toContain('If an account');
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('person@example.com', {
      redirectTo: `${callback}&flow=recovery`,
    });
  });
  it('verifies the account before the existing complete-signup RPC', async () => {
    auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { code: 'session_missing' },
    });
    await expect(finishProfile(client, 'Alex', true)).rejects.toThrow('expired');
    expect(rpc).not.toHaveBeenCalled();
    auth.getUser.mockResolvedValue({ data: { user: { id: 'actor' } }, error: null });
    rpc.mockResolvedValue({ error: null });
    await finishProfile(client, ' Alex ', true);
    expect(rpc).toHaveBeenCalledWith('complete_signup', {
      p_display_name: 'Alex',
      p_age_confirmed: true,
    });
  });
  it('rejects expired recovery sessions and separates password changes from sign-out', async () => {
    auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { code: 'session_missing' },
    });
    await expect(resetPassword(client, 'long-password')).rejects.toThrow('expired');
    expect(auth.updateUser).not.toHaveBeenCalled();
    auth.getUser.mockResolvedValue({ data: { user: { id: 'actor' } }, error: null });
    auth.updateUser.mockResolvedValue({ error: null });
    auth.signOut.mockResolvedValue({ error: null });
    await resetPassword(client, 'long-password');
    expect(auth.signOut).not.toHaveBeenCalled();
    await signOutAuth(client);
    expect(auth.signOut).toHaveBeenCalledOnce();
  });
  it('retries failed sign-out without submitting an already updated password again', async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: 'actor' } }, error: null });
    auth.updateUser.mockResolvedValue({ error: null });
    auth.signOut.mockResolvedValueOnce({ error: { message: 'offline' } });
    await resetPassword(client, 'long-password');
    await expect(signOutAuth(client)).rejects.toThrow('Could not sign out');
    auth.signOut.mockResolvedValue({ error: null });
    await signOutAuth(client);
    expect(auth.updateUser).toHaveBeenCalledExactlyOnceWith({ password: 'long-password' });
    expect(auth.signOut).toHaveBeenCalledTimes(2);
  });
  it('can cancel recovery by signing out without changing the password', async () => {
    auth.signOut.mockResolvedValue({ error: null });
    await signOutAuth(client);
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.signOut).toHaveBeenCalledOnce();
  });
  it('does not report a rejected password update as saved', async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: 'actor' } }, error: null });
    auth.updateUser.mockResolvedValue({ error: { code: 'same_password' } });
    await expect(resetPassword(client, 'long-password')).rejects.toThrow('different password');
    expect(auth.signOut).not.toHaveBeenCalled();
  });
  it('exchanges cold-start PKCE callbacks and recognizes recovery only after a valid session', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'actor' } } },
      error: null,
    });
    expect(
      await exchangeAuthCallback(client, new URLSearchParams('code=valid&flow=recovery')),
    ).toEqual({ recovery: true, userId: 'actor' });
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('valid');
    await expect(
      exchangeAuthCallback(client, new URLSearchParams('error=access_denied&code=valid')),
    ).rejects.toThrow('unavailable');
    expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
  });
  it('supports the existing cross-device email template without storing credentials in the handoff', async () => {
    auth.verifyOtp.mockResolvedValue({ data: { session: { user: { id: 'actor' } } }, error: null });
    expect(
      await exchangeAuthCallback(client, new URLSearchParams('token_hash=hash&type=email')),
    ).toEqual({ recovery: false, userId: 'actor' });
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash', type: 'email' });
    await expect(
      exchangeAuthCallback(client, new URLSearchParams('token_hash=hash&type=invite')),
    ).rejects.toThrow('expired');
  });
});
