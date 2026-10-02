import type { SupabaseClient } from '@supabase/supabase-js';
import { displayNameSchema, loginSchema, signupSchema, type Database } from '@dwd/core';
import { nativeLinkDestination, type AuthHandoff } from './auth-state';

export type AuthClient = SupabaseClient<Database>;
export class AuthFlowError extends Error {}
const emailValid = (email: string) => loginSchema.shape.email.safeParse(email.trim());
const fail = (message: string): never => {
  throw new AuthFlowError(message);
};

export async function googleSignIn(
  client: AuthClient,
  redirectTo: string,
  openBrowser: (url: string, returnUrl: string) => Promise<{ type: string; url?: string }>,
): Promise<string | null> {
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) return fail('Google sign-in is unavailable. Try again or use email.');
  const result = await openBrowser(data.url, redirectTo);
  if (result.type !== 'success') return null;
  const destination = nativeLinkDestination(result.url ?? '');
  if (!destination.startsWith('/auth/callback?'))
    return fail('Google sign-in could not return to the app. Try again or use email.');
  return destination;
}

export async function emailSignIn(
  client: AuthClient,
  email: string,
  password: string,
  handoff: AuthHandoff,
) {
  const parsed = loginSchema.safeParse({ email: email.trim(), password });
  if (!parsed.success)
    return fail(parsed.error.issues[0]?.message ?? 'Check your email and password.');
  const { error } = await client.auth.signInWithPassword(parsed.data);
  if (error?.code === 'email_not_confirmed') {
    handoff.confirmation(parsed.data.email);
    return 'confirm' as const;
  }
  if (error) return fail('Email or password not accepted. Please try again.');
  return 'signed-in' as const;
}

export async function emailSignUp(
  client: AuthClient,
  input: { email: string; password: string; displayName: string; ageConfirmed: boolean },
  redirectTo: string,
  handoff: AuthHandoff,
) {
  const parsed = signupSchema.safeParse({ ...input, email: input.email.trim() });
  if (!parsed.success)
    return fail(parsed.error.issues[0]?.message ?? 'Check your account details.');
  const { data, error } = await client.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName, age_confirmed: true },
      emailRedirectTo: redirectTo,
    },
  });
  if (error) return fail('Could not create your account. Check the details or try signing in.');
  if (data.session) return 'signed-in' as const;
  handoff.confirmation(parsed.data.email, Date.now() + 60_000);
  return 'confirm' as const;
}

export async function resendConfirmation(
  client: AuthClient,
  email: string,
  redirectTo: string,
  handoff: AuthHandoff,
) {
  const parsed = emailValid(email);
  if (!parsed.success) return fail('Enter a valid email address.');
  if (!handoff.reserveResend(parsed.data))
    return fail('Wait a minute before requesting another confirmation.');
  const { error } = await client.auth.resend({
    type: 'signup',
    email: parsed.data,
    options: { emailRedirectTo: redirectTo },
  });
  if (error)
    return fail('Could not send confirmation. Wait a minute, check the address and retry.');
  return 'If this email has a pending signup, a new email is on its way.';
}

export async function confirmCode(client: AuthClient, email: string, token: string) {
  const parsed = emailValid(email);
  if (!parsed.success || !/^\d{6,10}$/.test(token.trim()))
    return fail('Enter your email and the code from the latest email.');
  const { error } = await client.auth.verifyOtp({
    email: parsed.data,
    token: token.trim(),
    type: 'signup',
  });
  if (error) return fail('That code has expired or is incorrect. Try again or resend the email.');
}

export async function requestRecovery(client: AuthClient, email: string, redirectTo: string) {
  const parsed = emailValid(email);
  if (!parsed.success) return fail('Enter a valid email address.');
  const { error } = await client.auth.resetPasswordForEmail(parsed.data, { redirectTo });
  if (error) return fail('Could not send the reset link. Wait a moment and try again.');
  return 'If an account uses this email, a password reset link is on its way.';
}

export async function finishProfile(
  client: AuthClient,
  displayName: string,
  ageConfirmed: boolean,
) {
  const parsed = displayNameSchema.safeParse(displayName);
  if (!parsed.success || !ageConfirmed)
    return fail('Enter your name and confirm you are 18 or older.');
  const { error } = await client.auth.getUser();
  if (error) return fail('Your session has expired. Sign in again.');
  const result = await client.rpc('complete_signup', {
    p_display_name: parsed.data,
    p_age_confirmed: true,
  });
  if (result.error) return fail('Could not finish setting up your account. Please try again.');
}

export async function resetPassword(client: AuthClient, password: string) {
  if (password.length < 8 || password.length > 128)
    return fail('Use a password between 8 and 128 characters.');
  const { error } = await client.auth.getUser();
  if (error) return fail('This link has expired. Request a new password reset.');
  const result = await client.auth.updateUser({ password });
  if (result.error)
    return fail('Could not update your password. Use a different password or request a new link.');
}

// Separate the completed password change from retryable session cleanup.
export async function signOutAuth(client: AuthClient) {
  const { error } = await client.auth.signOut();
  if (error) return fail('Could not sign out. Check your connection and retry.');
}

// PKCE codes survive a cold start because Supabase persists the verifier in SQLite.
export async function exchangeAuthCallback(client: AuthClient, params: URLSearchParams) {
  if (params.has('error') || params.has('error_code'))
    return fail('This sign-in link is unavailable. Please try again.');
  const code = params.get('code');
  const tokenHash = params.get('token_hash');
  const type = params.get('type');
  const result = code
    ? await client.auth.exchangeCodeForSession(code)
    : tokenHash && (type === 'signup' || type === 'recovery' || type === 'email')
      ? await client.auth.verifyOtp({ token_hash: tokenHash, type })
      : null;
  if (!result || result.error || !result.data.session)
    return fail('This link has expired. Request a new email or sign in.');
  return {
    recovery: type === 'recovery' || params.get('flow') === 'recovery',
    userId: result.data.session.user.id,
  };
}

const callbackRequests = new WeakMap<
  AuthClient,
  { query: string; result: ReturnType<typeof exchangeAuthCallback> }
>();

// Coalesce Router/Strict Mode mounts while an exchange is pending. Forget the
// credential afterward so a replayed or expired link must be verified again.
export function exchangeAuthCallbackOnce(client: AuthClient, params: URLSearchParams) {
  const normalized = new URLSearchParams(params);
  normalized.sort();
  const query = normalized.toString();
  const previous = callbackRequests.get(client);
  if (previous?.query === query) return previous.result;
  const request = { query, result: exchangeAuthCallback(client, normalized) };
  callbackRequests.set(client, request);
  const clear = () => {
    if (callbackRequests.get(client) === request) callbackRequests.delete(client);
  };
  void request.result.then(clear, clear);
  return request.result;
}
