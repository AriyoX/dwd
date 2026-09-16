'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { completeSignupAction, type AuthActionState } from './actions';
import { SubmitButton } from '@/components/feedback/submit-button';
import { SignOutButton } from './sign-out-button';

export function CompleteSignupForm({ next, name }: { next: string; name: string }) {
  const [state, action] = useActionState(completeSignupAction, {} as AuthActionState);
  return (
    <form action={action} className="stack-lg">
      <input type="hidden" name="next" value={next} />
      <label className="field">
        Display name
        <input
          className="input"
          name="displayName"
          autoComplete="name"
          defaultValue={name}
          maxLength={60}
          required
        />
      </label>
      <label className="checkbox-row">
        <input type="checkbox" name="ageConfirmed" required />
        <span>I am 18 or older.</span>
      </label>
      {state.error && (
        <p className="error-box" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton idle="Continue" pending="Saving…" />
      <p className="muted small">
        By continuing, you agree to the{' '}
        <Link href="/terms" className="text-link">
          terms
        </Link>{' '}
        and acknowledge the{' '}
        <Link href="/privacy" className="text-link">
          privacy notice
        </Link>
        .
      </p>
      <SignOutButton />
    </form>
  );
}
