'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { blockUserAction, reportContentAction } from './moderation-actions';
import type { NightSnapshot } from '@dwd/core';

export function ContentControls({
  nightId,
  memberId = null,
  photoId = null,
  userId = null,
  label = 'Report or block',
}: {
  nightId: string;
  memberId?: string | null;
  photoId?: string | null;
  userId?: string | null;
  label?: string;
}) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [locked, setLocked] = useState(false);
  const inFlight = useRef(false);
  const attempt = useRef<{
    nightId: string;
    memberId: string | null;
    photoId: string | null;
    reason: string;
    requestKey: string;
  } | null>(null);
  async function submit(block: boolean) {
    if (inFlight.current) return;
    if (
      block &&
      !window.confirm(
        'Block this person? You stop sharing active nights. If you host, they are removed; otherwise you leave shared active nights. You can unblock them in Account.',
      )
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    try {
      attempt.current ??= { nightId, memberId, photoId, reason, requestKey: crypto.randomUUID() };
      if (!block) setLocked(true);
      const result = block
        ? await blockUserAction(userId)
        : await reportContentAction(attempt.current);
      if (!result.ok) setMessage(result.error);
      else if (block) {
        router.replace('/home');
        router.refresh();
      } else {
        setSent(true);
        setMessage('Report sent. Check Your messages in Account for replies.');
      }
    } catch {
      setMessage('Could not connect. Retry when connected.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <details className="stack small">
      <summary>{label}</summary>
      <div className="stack">
        {!sent ? (
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              void submit(false);
            }}
          >
            <label className="field">
              What happened?
              <textarea
                className="input"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={10}
                maxLength={2000}
                required
                disabled={busy || locked}
              />
            </label>
            <Button type="submit" disabled={busy || reason.trim().length < 10}>
              {busy ? 'Sending…' : 'Send report'}
            </Button>
          </form>
        ) : null}
        {userId ? (
          <Button type="button" variant="danger" disabled={busy} onClick={() => void submit(true)}>
            Block person
          </Button>
        ) : null}
        {message ? <p role="status">{message}</p> : null}
      </div>
    </details>
  );
}

export function NightContentControls({ snapshot }: { snapshot: NightSnapshot }) {
  return (
    <details className="stack">
      <summary>Report content or block someone</summary>
      <div className="stack">
        <ContentControls nightId={snapshot.night.id} label="Report this night" />
        {snapshot.members
          .filter((member) => member.userId !== snapshot.currentUserId)
          .map((member) => (
            <ContentControls
              key={member.id}
              nightId={snapshot.night.id}
              memberId={member.id}
              userId={member.userId}
              label={member.displayName}
            />
          ))}
      </div>
    </details>
  );
}
