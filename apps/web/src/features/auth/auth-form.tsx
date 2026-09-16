'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { loginAction, signupAction, type AuthActionState } from './actions';
import { SubmitButton } from '@/components/feedback/submit-button';
import { PasswordField } from '@/components/ui/password-field';

import { GoogleSignIn } from './google-sign-in';

const initialState: AuthActionState = {};

function FieldError({ id, errors }: { id: string; errors: string[] | undefined }) {
  if (errors === undefined || errors.length === 0) return null;
  return (
    <span id={id} className="field-error" role="alert">
      {errors[0]}
    </span>
  );
}

function EmailField({ errors }: { errors: string[] | undefined }) {
  return (
    <div className="field">
      <label htmlFor="email">Email address</label>
      <input
        className="input"
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="you@example.com"
        maxLength={254}
        required
        aria-invalid={errors !== undefined}
        aria-describedby={errors === undefined ? undefined : 'email-error'}
      />
      <FieldError id="email-error" errors={errors} />
    </div>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(loginAction, initialState);
  return (
    <form action={action} className="stack-lg">
      <input type="hidden" name="next" value={next} />
      <GoogleSignIn next={next} />
      <div className="stack">
        <EmailField errors={state.fieldErrors?.['email']} />
        <PasswordField error={state.fieldErrors?.['password']?.[0]} />
        <Link
          href={`/forgot-password?next=${encodeURIComponent(next)}`}
          className="text-link small"
          style={{ justifySelf: 'end' }}
        >
          Forgot password?
        </Link>
      </div>
      {state.error === undefined ? null : (
        <div className="error-box" role="alert">
          {state.error}
        </div>
      )}
      <SubmitButton idle="Sign in" pending="Signing in…" />
      <p className="muted small form-switch">
        New to DWD?{' '}
        <Link href={`/signup?next=${encodeURIComponent(next)}`} className="text-link">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function SignupForm({ next }: { next: string }) {
  const [state, action] = useActionState(signupAction, initialState);
  return (
    <form action={action} className="stack-lg">
      <input type="hidden" name="next" value={next} />
      <GoogleSignIn next={next} />
      <div className="stack">
        <div className="field">
          <label htmlFor="displayName">Display name</label>
          <input
            className="input"
            id="displayName"
            name="displayName"
            type="text"
            autoComplete="name"
            placeholder="What should we call you?"
            maxLength={60}
            required
            aria-invalid={state.fieldErrors?.['displayName'] !== undefined}
            aria-describedby={
              state.fieldErrors?.['displayName'] === undefined ? undefined : 'name-error'
            }
          />
          <FieldError id="name-error" errors={state.fieldErrors?.['displayName']} />
        </div>
        <EmailField errors={state.fieldErrors?.['email']} />
        <PasswordField newPassword error={state.fieldErrors?.['password']?.[0]} />
        <label className="checkbox-row">
          <input
            name="ageConfirmed"
            type="checkbox"
            required
            aria-describedby={
              state.fieldErrors?.['ageConfirmed'] === undefined ? undefined : 'age-error'
            }
          />
          <span>I am 18 or older.</span>
        </label>
        <FieldError id="age-error" errors={state.fieldErrors?.['ageConfirmed']} />
      </div>
      {state.error === undefined ? null : (
        <div className="error-box" role="alert">
          {state.error}
        </div>
      )}
      <SubmitButton idle="Create account" pending="Creating account…" />
      <p className="muted small form-switch">
        Already have an account?{' '}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-link">
          Sign in
        </Link>
      </p>
    </form>
  );
}
