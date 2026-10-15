'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Plus, GlassWater, Undo2 } from 'lucide-react';
import { quickCounts, quickTotalsLabel, quickMainDrink, type MemberSnapshot } from '@dwd/core';
import type { PendingDrinkLog } from '@dwd/contracts';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { QuickLogAds } from './floating-ads';
import styles from './quick-log.module.css';

export interface LinkedQuickControls {
  finished: boolean;
  writable: boolean;
  onFinish: () => void;
  onStart: () => void;
}

export function LinkedControls({
  controls,
  member,
  nightId,
  title,
  active,
  host,
  busy,
  online,
  pending,
  onLog,
  onWater,
  onUndo,
  onChoose,
  onEnd,
}: {
  controls: LinkedQuickControls;
  member: MemberSnapshot;
  nightId: string;
  title: string;
  active: boolean;
  host: boolean;
  busy: boolean;
  online: boolean;
  pending: PendingDrinkLog[];
  onLog: () => void;
  onWater: () => void;
  onUndo: () => void;
  onChoose: () => void;
  onEnd: () => void;
}) {
  const [finishing, setFinishing] = useState(false);
  const main = quickMainDrink(member);
  const earlier = quickCounts(member.quickLogs ?? []);
  const queued = pending.filter(
    (entry) =>
      entry.nightMemberId === member.id &&
      !['permanent_failure', 'needs_confirmation'].includes(entry.status),
  );
  const disabled = busy || !controls.writable || controls.finished || !active;
  return (
    <div className={styles['logger']}>
      <header className={styles['header']}>
        <h1>Quick Log</h1>
        <Link replace className="button button-ghost" href="/home">
          Home
        </Link>
      </header>
      <Link replace className="card row-between" href={`/night/${nightId}`}>
        <strong>{title}</strong>
        <span className="pill">{active ? 'Linked' : 'Ended'}</span>
      </Link>
      <div className={styles['totals']}>
        <strong className={styles['summary']}>
          {quickTotalsLabel(
            member.drinkLogs.filter((entry) => !entry.deletedAt).length +
              earlier.drink +
              queued.filter((entry) => entry.kind === 'alcohol').length,
            member.waterLogs.filter((entry) => !entry.deletedAt).length +
              earlier.chaser +
              queued.filter((entry) => entry.kind === 'water').length,
          )}
        </strong>
        <span className="muted small">
          {controls.finished ? 'Quick Log finished' : 'Your total for this night'}
        </span>
      </div>
      <div className={styles['logControl']}>
        <Button
          type="button"
          className={styles['tap']}
          disabled={disabled}
          onClick={main ? onLog : onChoose}
        >
          <Plus size={40} aria-hidden="true" />
          {main ? `Log ${main.label}` : 'Choose a drink'}
        </Button>
        {main ? (
          <span className="pill">
            {main.volumeMl} ml · {main.abvPercent}%
          </span>
        ) : null}
        <div className={styles['secondaryActions']}>
          <Button type="button" variant="secondary" disabled={disabled} onClick={onWater}>
            <GlassWater size={18} /> Chaser
          </Button>
          <Button type="button" variant="ghost" disabled={disabled} onClick={onUndo}>
            <Undo2 size={18} /> Undo
          </Button>
        </div>
        <Button type="button" variant="ghost" disabled={disabled} onClick={onChoose}>
          Change drink
        </Button>
      </div>
      <Link replace className="button button-secondary" href={`/night/${nightId}`}>
        View night & entries
      </Link>
      {controls.finished ? (
        <Button
          type="button"
          variant="secondary"
          disabled={!controls.writable}
          onClick={controls.onStart}
        >
          Start another session
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          disabled={busy || !controls.writable}
          onClick={() => setFinishing(true)}
        >
          Finish session
        </Button>
      )}
      <Dialog
        open={finishing && !controls.finished}
        title={active && host ? 'End the night too?' : 'Finish Quick Log?'}
        description={
          active && host
            ? 'Ending the night ends it for everyone.'
            : active
              ? 'The night will stay open for everyone.'
              : 'Your entries are saved in the night.'
        }
        onClose={() => {
          if (!busy) setFinishing(false);
        }}
      >
        <div className="stack">
          {pending.length > 0 ? (
            <p className="warning-box">
              Some entries still need saving. Review them before ending the night.
            </p>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              controls.onFinish();
              setFinishing(false);
            }}
          >
            Finish Quick Log only
          </Button>
          {active && host ? (
            <Button
              type="button"
              variant="danger"
              disabled={busy || !online || pending.length > 0}
              onClick={onEnd}
            >
              End night too
            </Button>
          ) : null}
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setFinishing(false)}>
            Keep logging
          </Button>
        </div>
      </Dialog>
      <QuickLogAds />
    </div>
  );
}
