'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cancelAccountDeletionAction, scheduleAccountDeletionAction } from './actions';

export function AccountDeletion({
  initialDeletion,
  expanded = false,
}: {
  initialDeletion: { delete_after: string; status: string } | null;
  expanded?: boolean;
}) {
  const router = useRouter();
  const [deletion, setDeletion] = useState(initialDeletion);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function submit() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const result = deletion
        ? await cancelAccountDeletionAction()
        : await scheduleAccountDeletionAction({ confirmed });
      if (!result.ok) setError(result.error);
      else if (deletion) {
        setDeletion(null);
        setConfirmed(false);
        router.refresh();
      } else {
        router.replace('/login?deletion=scheduled');
        router.refresh();
      }
    } catch {
      setError('Could not connect. Retry when connected.');
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <details className="account-deletion" open={expanded || undefined}>
      <summary>Delete your account</summary>
      <div className="stack">
        <p>
          Your account and uploaded photos will be deleted after 30 days. Signing in before deletion
          starts cancels it.
        </p>
        <p className="muted small">
          Your personal entries and plans will be removed. Other participants’ records remain;
          nights you host will be closed. Clear saved browser data on each device.
        </p>
        {deletion ? (
          <>
            <p className="notice-box" role="status">
              {deletion.status === 'processing'
                ? 'Account deletion is in progress.'
                : `Deletion scheduled for ${new Date(deletion.delete_after).toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })}.`}
            </p>
            <Button
              type="button"
              variant="secondary"
              disabled={pending || deletion.status === 'processing'}
              onClick={() => void submit()}
            >
              {pending ? 'Cancelling…' : 'Cancel deletion'}
            </Button>
          </>
        ) : (
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={pending}
                required
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>
                I understand I will be signed out and my account will be deleted after 30 days
                without signing in.
              </span>
            </label>
            <Button type="submit" variant="danger" disabled={!confirmed || pending}>
              {pending ? 'Scheduling…' : 'Delete account in 30 days'}
            </Button>
          </form>
        )}
        {error ? (
          <p className="error-box" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </details>
  );
}
