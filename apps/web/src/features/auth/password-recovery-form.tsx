'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { requestPasswordResetAction, updatePasswordAction, type AuthActionState } from './actions';
import { PasswordField } from '@/components/ui/password-field';
import { SubmitButton } from '@/components/feedback/submit-button';

export function PasswordRecoveryForm({ reset = false, next }: { reset?: boolean; next: string }) {
  const [state, action] = useActionState(
    reset ? updatePasswordAction : requestPasswordResetAction,
    {} as AuthActionState,
  );
  return (
    <form action={action} className="stack-lg">
      <input type="hidden" name="next" value={next} />
      {state.success === undefined ? (
        <>
          {reset ? (
            <PasswordField newPassword />
          ) : (
            <div className="field">
              <label htmlFor="email">Email address</label>
              <input
                className="input"
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                placeholder="you@example.com"
                maxLength={254}
                required
              />
            </div>
          )}
          {state.error === undefined ? null : (
            <div className="error-box" role="alert">
              {state.error}
            </div>
          )}
          <SubmitButton
            idle={reset ? 'Save new password' : 'Send reset link'}
            pending={reset ? 'Saving…' : 'Sending…'}
          />
        </>
      ) : (
        <div className="success-box" role="status">
          {state.success}
        </div>
      )}
      {reset ? (
        <Link
          href={`/forgot-password?next=${encodeURIComponent(next)}`}
          className="text-link small"
        >
          Request a new reset link
        </Link>
      ) : null}
      <Link className="text-link small" href={`/login?next=${encodeURIComponent(next)}`}>
        Back to sign in
      </Link>
    </form>
  );
}
