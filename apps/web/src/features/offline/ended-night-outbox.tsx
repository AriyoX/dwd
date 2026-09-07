'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PendingDrinkLog } from '@dwd/contracts';
import { Button } from '@/components/ui/button';
import { Card, Eyebrow } from '@/components/ui/card';
import { useConnection } from '@/providers/connection-provider';
import { createBrowserOutbox, type BrowserOutboxBundle } from './browser-outbox';
import type { SyncOutcome } from './outbox';

export function EndedNightOutbox({
  nightId,
  currentUserId,
}: {
  nightId: string;
  currentUserId: string;
}) {
  const router = useRouter();
  const { online, activityVersion } = useConnection();
  const [{ store, outbox }] = useState<BrowserOutboxBundle>(createBrowserOutbox);
  const [records, setRecords] = useState<PendingDrinkLog[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const belongsHere = useCallback(
    (record: PendingDrinkLog) => record.nightId === nightId && record.actorUserId === currentUserId,
    [currentUserId, nightId],
  );
  const load = useCallback(async () => {
    setRecords((await store.getAll()).filter(belongsHere));
  }, [belongsHere, store]);

  useEffect(() => {
    let active = true;
    const synchronize = async () => {
      const outcomes = online ? await outbox.retryAll(belongsHere) : [];
      if (!active) return;
      await load();
      if (outcomes.some((outcome) => outcome.status === 'synced')) router.refresh();
    };
    void synchronize();
    return () => {
      active = false;
    };
  }, [activityVersion, belongsHere, load, online, outbox, router]);

  async function handle(record: PendingDrinkLog, operation: Promise<SyncOutcome>) {
    setBusyKey(record.idempotencyKey);
    const outcome = await operation;
    await load();
    setBusyKey(null);
    if (outcome.status === 'synced') {
      setMessage(
        `${record.memberDisplayName}: ${record.kind === 'water' ? 'water' : 'drink'} saved.`,
      );
      router.refresh();
    } else if (outcome.status === 'needs_confirmation') {
      setMessage('Review the warning shown with this entry.');
    } else if (outcome.status === 'retryable_failure' || outcome.status === 'permanent_failure') {
      setMessage(outcome.message);
    }
  }

  async function remove(record: PendingDrinkLog) {
    setBusyKey(record.idempotencyKey);
    await outbox.remove(record.idempotencyKey);
    await load();
    setBusyKey(null);
    setMessage('Unsaved entry removed from this device.');
  }

  if (records.length === 0 && message === null) return null;
  return (
    <Card className="stack">
      <div>
        <Eyebrow>Offline entries</Eyebrow>
        <h2>Entries waiting to save</h2>
        <p className="muted small">
          Go online within 24 hours of the night ending to save entries made before it ended. Some
          entries may need your review.
        </p>
      </div>
      {message === null ? null : (
        <p role="status" className="muted small">
          {message}
        </p>
      )}
      {records.map((record) => {
        const warnings = record.requiredWarnings ?? [];
        const busy = busyKey === record.idempotencyKey;
        return (
          <div className="pending-entry stack" key={record.idempotencyKey}>
            <div className="row-between">
              <strong>
                {record.memberDisplayName} ·{' '}
                {record.kind === 'water'
                  ? 'Water'
                  : (record.planItemLabel ?? record.drinkSnapshot?.label ?? 'Drink')}
              </strong>
              <span className="pill">
                {record.status === 'needs_confirmation'
                  ? 'Review needed'
                  : record.status === 'permanent_failure'
                    ? 'Could not save'
                    : record.status === 'failed'
                      ? 'Try again'
                      : record.status === 'syncing'
                        ? 'Saving'
                        : 'Waiting to save'}
              </span>
            </div>
            {warnings.includes('plan_exceeded') ? (
              <div className="warning-box">This is beyond the plan set earlier.</div>
            ) : null}
            {warnings.includes('after_end') ? (
              <div className="warning-box">This entry was after the planned end time.</div>
            ) : null}
            {record.lastError === undefined ? null : (
              <p className="muted small">{record.lastError}</p>
            )}
            <div className="row">
              {record.status === 'needs_confirmation' ? (
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void handle(record, outbox.confirmAndRetry(record.idempotencyKey, warnings))
                  }
                >
                  Save anyway
                </Button>
              ) : null}
              {record.status === 'failed' ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || !online}
                  onClick={() => void handle(record, outbox.syncOne(record.idempotencyKey, true))}
                >
                  Retry
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => void remove(record)}
              >
                Remove
              </Button>
            </div>
          </div>
        );
      })}
    </Card>
  );
}
