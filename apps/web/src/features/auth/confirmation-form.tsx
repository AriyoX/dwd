'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import {
  resendConfirmationAction,
  verifyConfirmationAction,
  continueAfterConfirmationAction,
  isConfirmationComplete,
  type AuthActionState,
} from './actions';
import { Button } from '@/components/ui/button';
import { SubmitButton } from '@/components/feedback/submit-button';
import { safeReturnPath } from '@/lib/navigation';

export function ConfirmationForm({
  next,
  email = '',
  retryAt = 0,
  codeEnabled = false,
}: {
  next: string;
  email?: string;
  retryAt?: number;
  codeEnabled?: boolean;
}) {
  const [address, setAddress] = useState(email);
  const [state, resend, pending] = useActionState(resendConfirmationAction, {} as AuthActionState);
  const [verification, verify] = useActionState(
    codeEnabled ? verifyConfirmationAction : continueAfterConfirmationAction,
    {} as AuthActionState,
  );
  const [now, setNow] = useState(0);
  useEffect(() => {
    const update = () => setNow(Date.now());
    queueMicrotask(update);
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    let checking = false;
    const check = async () => {
      if (document.visibilityState !== 'visible' || checking) return;
      checking = true;
      try {
        const confirmed = await isConfirmationComplete(email);
        if (!cancelled && confirmed) {
          window.location.replace(safeReturnPath(next));
        }
      } catch {
        // Code entry and retry remain usable while offline.
      } finally {
        checking = false;
      }
    };
    void check();
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    const timer = window.setInterval(onFocus, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [email, next]);
  const seconds =
    now === 0
      ? retryAt > 0
        ? 60
        : 0
      : Math.max(0, Math.ceil(((state.retryAt ?? retryAt) - now) / 1000));
  return (
    <div className="stack-lg">
      {email ? (
        <p className="muted confirmation-email">
          Open the link sent to <strong>{email}</strong>
          {codeEnabled ? ', or enter the code from that email here.' : ' to continue.'}
        </p>
      ) : (
        <p className="muted">Enter your signup email to confirm your account.</p>
      )}
      <form action={verify} className="stack">
        <input type="hidden" name="next" value={next} />
        {email ? (
          <input type="hidden" name="email" value={email} />
        ) : (
          <label className="field">
            Email address
            <input
              name="email"
              className="input"
              type="email"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              required
            />
          </label>
        )}
        {codeEnabled && (
          <label className="field">
            Confirmation code
            <input
              className="input"
              name="token"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,10}"
              minLength={6}
              maxLength={10}
              required
              aria-describedby="code-help"
            />
          </label>
        )}
        <p id="code-help" className="muted small">
          Use the most recent email. Check spam if it hasn’t arrived.
        </p>
        {verification.error && (
          <p className="error-box" role="alert">
            {verification.error}
          </p>
        )}
        <SubmitButton
          idle={codeEnabled ? 'Confirm and continue' : 'I’ve confirmed my email'}
          pending={codeEnabled ? 'Confirming…' : 'Checking…'}
        />
      </form>
      <form action={resend} className="stack">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="email" value={address} />
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
        <Button
          type="submit"
          variant="secondary"
          full
          disabled={pending || seconds > 0 || !address}
          aria-busy={pending}
        >
          {pending ? 'Sending…' : seconds > 0 ? `Resend in ${seconds}s` : 'Resend email'}
        </Button>
      </form>
      <div className="stack small">
        <Link className="text-link" href={`/signup?correct=1&next=${encodeURIComponent(next)}`}>
          Use a different email
        </Link>
        <Link className="text-link" href={`/login?next=${encodeURIComponent(next)}`}>
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
