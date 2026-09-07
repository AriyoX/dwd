'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import { resendConfirmationAction, type AuthActionState } from './actions';
import { Button } from '@/components/ui/button';

export function ConfirmationForm({
  next,
  email = '',
  retryAt = 0,
}: {
  next: string;
  email?: string;
  retryAt?: number;
}) {
  const [state, action, pending] = useActionState(resendConfirmationAction, {} as AuthActionState);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const update = () => setNow(Date.now());
    queueMicrotask(update);
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil(((state.retryAt ?? retryAt) - now) / 1000));
  return (
    <div className="stack">
      <form action={action} className="stack">
        <input type="hidden" name="next" value={next} />
        <label className="field">
          Confirmation email
          <input
            name="email"
            className="input"
            type="email"
            defaultValue={email}
            autoComplete="email"
            maxLength={254}
            required
          />
        </label>
        {state.error && (
          <p className="error-box" role="alert">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="success-box" role="status">
            {state.success}
          </p>
        )}
        <Button type="submit" full disabled={pending || seconds > 0}>
          {pending
            ? 'Sending…'
            : seconds > 0
              ? `Resend in ${now === 0 ? 60 : seconds}s`
              : 'Resend confirmation'}
        </Button>
      </form>
      <p className="muted small">
        Check spam and use the newest link. Email delivery is limited while the sender setup is
        pending.
      </p>
      <Link className="text-link" href={`/signup?correct=1&next=${encodeURIComponent(next)}`}>
        Correct a mistyped email
      </Link>
      <Link className="text-link" href={`/login?next=${encodeURIComponent(next)}`}>
        Already confirmed? Sign in
      </Link>
      <Link className="text-link" href={`/forgot-password?next=${encodeURIComponent(next)}`}>
        Reset your password
      </Link>
      <Link className="button button-secondary" href={`/demo?next=${encodeURIComponent(next)}`}>
        Try a demo while you wait
      </Link>
    </div>
  );
}
