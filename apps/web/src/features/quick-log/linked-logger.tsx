'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getNightSnapshot } from '@dwd/data';
import {
  availableQuickEntries,
  quickLinkedMember,
  quickLinkedNight,
  type NightSnapshot,
  type QuickSession,
} from '@dwd/core';
import { ActiveNightClient } from '@/features/nights/active-night-client';
import { Button } from '@/components/ui/button';
import { useBrowserQuickLog } from './provider';
import type { LinkedQuickControls } from './linked-controls';

export function LinkedQuickLogger({
  quick,
  controls,
}: {
  quick: QuickSession;
  controls: LinkedQuickControls;
}) {
  const { client, session } = useBrowserQuickLog();
  const link = quickLinkedNight(quick);
  if (!link) throw new Error('This session has no linked night.');
  const [snapshot, setSnapshot] = useState<NightSnapshot | null>(null);
  const [issue, setIssue] = useState(false);
  const [attempt, retry] = useState(0);
  const owner = session?.user.id;
  useEffect(() => {
    if (!client || !owner) return;
    let alive = true;
    void getNightSnapshot(client, link.nightId)
      .then((value) => {
        if (alive) {
          setSnapshot(value);
          setIssue(false);
        }
      })
      .catch(() => {
        if (alive) setIssue(true);
      });
    const resume = () => retry((value) => value + 1);
    window.addEventListener('online', resume);
    return () => {
      alive = false;
      window.removeEventListener('online', resume);
    };
  }, [client, owner, link.nightId, attempt]);
  const member = snapshot && owner ? quickLinkedMember(snapshot, link, owner) : null;
  if (!snapshot || !member)
    return (
      <div className="stack">
        <h1>Quick Log</h1>
        <p role="status">
          {!owner
            ? 'Sign in to keep logging with your night.'
            : issue || snapshot
              ? 'Could not open your night. Your entries are still saved.'
              : 'Opening your night…'}
        </p>
        {!owner ? (
          <Link
            className="button button-primary"
            href={`/login?next=${encodeURIComponent(`/quick-log?scope=account&sessionId=${quick.id}`)}`}
          >
            Sign in
          </Link>
        ) : (
          <Button type="button" onClick={() => retry((value) => value + 1)}>
            Try again
          </Button>
        )}
        <Link replace className="button button-secondary" href={owner ? '/home' : '/'}>
          Back
        </Link>
        <Button
          type="button"
          variant="ghost"
          disabled={!controls.writable}
          onClick={controls.onFinish}
        >
          Finish Quick Log only
        </Button>
        {controls.finished ? (
          <Button type="button" onClick={controls.onStart}>
            Start another session
          </Button>
        ) : null}
      </div>
    );
  return (
    <>
      {availableQuickEntries(quick).length ? (
        <Link
          replace
          className="button button-secondary"
          href={`/quick-log/add?scope=${quick.scope === 'guest' ? 'guest' : 'account'}&sessionId=${quick.id}&nightId=${link.nightId}`}
        >
          Add remaining earlier entries ({availableQuickEntries(quick).length})
        </Link>
      ) : null}
      <ActiveNightClient
        key={`${owner}:${link.nightId}`}
        initialSnapshot={snapshot}
        openInviteInitially={false}
        setupPlanInitially={false}
        fastInitially={null}
        quickSession={controls}
      />
    </>
  );
}
