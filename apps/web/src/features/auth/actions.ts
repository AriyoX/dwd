'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { loginSchema, signupSchema } from '@dwd/core';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSiteUrl } from '@/lib/supabase/env';
import { safeReturnPath } from '@/lib/navigation';

export interface AuthActionState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[] | undefined>;
}

export async function loginAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next') ?? undefined,
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const result = await createServerSupabaseClient()
    .then((supabase) =>
      supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      }),
    )
    .catch(() => null);
  if (result === null) return { error: 'Couldn’t connect. Please try again.' };
  const { error } = result;
  if (error !== null) return { error: 'Email or password not accepted. Please try again.' };
  redirect(safeReturnPath(parsed.data.next));
}

export async function signupAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const nextValue = formData.get('next');
  const next = typeof nextValue === 'string' ? nextValue : undefined;
  const parsed = signupSchema.safeParse({
    displayName: formData.get('displayName'),
    email: formData.get('email'),
    password: formData.get('password'),
    ageConfirmed: formData.get('ageConfirmed') === 'on',
    ...(next === undefined ? {} : { next }),
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const returnPath = safeReturnPath(parsed.data.next);
  const result = await createServerSupabaseClient()
    .then((supabase) =>
      supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          data: {
            display_name: parsed.data.displayName,
            age_confirmed: true,
          },
          emailRedirectTo: `${getSiteUrl()}/auth/confirm?next=${encodeURIComponent(returnPath)}`,
        },
      }),
    )
    .catch(() => null);
  if (result === null) return { error: 'Couldn’t connect. Please try again.' };
  const { data, error } = result;
  if (error !== null) {
    return {
      error: 'We could not complete signup. Check the details or try signing in.',
    };
  }
  if (data.session !== null) redirect(returnPath);
  return { success: 'Check your email to confirm your account, then return here to sign in.' };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function requestPasswordResetAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = z.email().max(254).safeParse(formData.get('email'));
  if (!email.success) return { error: 'Enter a valid email address.' };
  const nextValue = formData.get('next');
  const next = safeReturnPath(typeof nextValue === 'string' ? nextValue : undefined);
  const resetPath = `/reset-password?next=${encodeURIComponent(next)}`;
  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
      redirectTo: `${getSiteUrl()}/auth/confirm?next=${encodeURIComponent(resetPath)}`,
    });
    if (error !== null)
      return { error: 'Couldn’t send the reset link. Wait a moment and try again.' };
    return { success: 'If an account uses this email, a password reset link is on its way.' };
  } catch {
    return { error: 'Couldn’t connect. Please try again.' };
  }
}

export async function updatePasswordAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = z.string().min(8).max(128).safeParse(formData.get('password'));
  if (!password.success) return { error: 'Use a password between 8 and 128 characters.' };
  const nextValue = formData.get('next');
  const next = safeReturnPath(typeof nextValue === 'string' ? nextValue : undefined);
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error: claimsError } = await supabase.auth.getClaims();
    if (claimsError !== null || data?.claims.sub === undefined)
      return { error: 'This link has expired. Request a new password reset.' };
    const { error } = await supabase.auth.updateUser({ password: password.data });
    if (error !== null)
      return {
        error:
          'Couldn’t update your password. Use a different password or request a new reset link.',
      };
    await supabase.auth.signOut();
  } catch {
    return { error: 'Couldn’t connect. Please try again.' };
  }
  redirect(`/login?updated=1&next=${encodeURIComponent(next)}`);
}
