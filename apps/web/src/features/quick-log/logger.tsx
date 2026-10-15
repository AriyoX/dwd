'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  GlassWater,
  History,
  MoreHorizontal,
  Plus,
  Undo2,
} from 'lucide-react';
import {
  QUICK_LOG_RETENTION,
  availableQuickEntries,
  isQuickSessionStale,
  quickCountLabel,
  quickKindLabel,
  quickCorrectionKind,
  quickEntryLocked,
  quickRelativeTime,
  compareQuickEntries,
  unresolvedQuickTransfers,
  type QuickKind,
} from '@dwd/core';
import type { QuickLogStore } from '@dwd/contracts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useBrowserQuickLog, useQuickStoreState } from './provider';
import styles from './quick-log.module.css';
import { AccountBenefits } from './account-benefits';
import { QuickLogAds } from './floating-ads';

export function QuickLogger({
  history = false,
  homepage = false,
}: {
  history?: boolean;
  homepage?: boolean;
}) {
  const context = useBrowserQuickLog();
  const params = useSearchParams();
  if (!context.store) return <p role="status">Opening device logs…</p>;
  return (
    <Logger
      key={`${context.store.scope}:${history}:${params.get('sessionId') ?? ''}`}
      store={context.store}
      history={history}
      homepage={homepage}
    />
  );
}
function Logger({
  store,
  history,
  homepage,
}: {
  store: QuickLogStore;
  history: boolean;
  homepage: boolean;
}) {
  const state = useQuickStoreState(store);
  const {
    writable,
    issue: storageIssue,
    retry,
    session: account,
    pinGuest,
    syncIssue,
    retrySync,
  } = useBrowserQuickLog();
  const params = useSearchParams();
  const router = useRouter();
  const [selected, setSelected] = useState(params.get('sessionId'));

  const undo = state.record.undo;
  const [message, setMessage] = useState('');
  const [issue, setIssue] = useState<string | null>(null);
  const [continued, setContinued] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const options = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (options.current && !options.current.contains(event.target as Node))
        options.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && options.current?.open) {
        options.current.open = false;
        options.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const current = store.session(selected);
  const suffix = `?scope=${store.scope === 'guest' ? 'guest' : 'account'}`;
  const stale = continued !== current?.id && isQuickSessionStale(current, now);
  const readOnly = current?.state === 'finished';
  const enabled =
    writable && state.hydrated && !state.blocked && !readOnly && !stale && state.record.eligible;
  const pending = unresolvedQuickTransfers(state.record).find((o) => o.sessionId === current?.id);
  const entries = [...(current?.entries ?? [])]
    .filter((e) => !e.removedAt)
    .sort((a, b) => compareQuickEntries(b, a));
  const historySessions = state.record.sessions
    .filter((s) => (store.scope !== 'guest' || !s.claimedBy) && availableQuickEntries(s).length)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
  const canUndo =
    undo &&
    current?.state === 'active' &&
    current.entries.some(
      (e) =>
        e.id === undo.entryId && e.revision === undo.revision && !quickEntryLocked(state.record, e),
    );
  function run(action: () => void) {
    try {
      action();
      setIssue(null);
    } catch (e) {
      setIssue(e instanceof Error ? e.message : 'Couldn’t update this entry.');
    }
  }
  function closeOptions() {
    if (!options.current?.open) return;
    if (options.current.contains(document.activeElement))
      options.current.querySelector('summary')?.focus();
    options.current.open = false;
  }
  function log(kind: QuickKind) {
    run(() => {
      store.log(kind);
      closeOptions();
      if (store.scope === 'guest') pinGuest();
      setSelected(null);
      setMessage(
        `${quickKindLabel(kind)} logged. ${quickCountLabel(store.session()?.entries ?? [])}`,
      );
      setNow(Date.now());
    });
  }
  function startNew() {
    run(() => {
      store.startNew();
      closeOptions();
      window.history.replaceState(null, '', `/quick-log${suffix}`);
      setSelected(null);
      setContinued(null);
    });
  }
  function add() {
    run(() => {
      if (!current) return;
      if (!pending)
        store.setIntent({
          sessionId: current.id,
          accountId: account?.user.id ?? null,
          nightId: null,
          destination: 'choose',
        });
      if (!store.getSnapshot().saved) throw new Error('Couldn’t save on this device');
      router.push(
        `/quick-log/add?scope=${store.scope === 'guest' ? 'guest' : 'account'}&sessionId=${current.id}`,
      );
    });
  }
  return (
    <div className={styles['logger']}>
      <header className={styles['header']}>
        {!homepage ? (
          <Link
            className="button button-ghost"
            href={history ? `/quick-log${suffix}` : account ? '/home' : '/'}
            aria-label="Back"
          >
            <ArrowLeft size={22} aria-hidden="true" />
          </Link>
        ) : null}
        <h1 className={homepage ? styles['homepageHeading'] : undefined}>
          {history ? 'Past quick sessions' : homepage ? 'Just log it.' : 'Quick Log'}
        </h1>
        <details ref={options} className={styles['options']}>
          <summary className="button button-ghost" aria-label="Session options">
            <MoreHorizontal size={24} aria-hidden="true" />
          </summary>
          <div className={`stack card ${styles['menu']}`}>
            <Link className="button button-ghost" href={`/quick-log/history${suffix}`}>
              <History size={18} aria-hidden="true" /> Past quick sessions
            </Link>
            {account ? (
              <Link
                className="button button-ghost"
                href={`/quick-log?scope=${store.scope === 'guest' ? 'account' : 'guest'}`}
              >
                {store.scope === 'guest'
                  ? 'Your account’s quick logs'
                  : 'Guest logs on this device'}
              </Link>
            ) : null}
            {!history && current && !readOnly ? (
              <Button type="button" variant="ghost" disabled={!writable} onClick={startNew}>
                Finish and start new
              </Button>
            ) : null}
            <p className="muted small">{QUICK_LOG_RETENTION}</p>
            {!history ? (
              <Button type="button" variant="ghost" disabled={!enabled} onClick={() => log('shot')}>
                Log a shot
              </Button>
            ) : null}
            {current ? (
              <p className="muted small">Started {new Date(current.createdAt).toLocaleString()}</p>
            ) : null}
            {state.recoveryRaw ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const blob = new Blob([state.recoveryRaw ?? ''], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'dwd-quick-log-recovery.json';
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Save original data for recovery
                </Button>
                <pre className={styles['recovery']}>{state.recoveryRaw}</pre>
              </>
            ) : null}
          </div>
        </details>
      </header>
      {!account && !history ? (
        <AccountBenefits
          next={`/quick-log?scope=account${current ? `&sessionId=${current.id}` : ''}`}
          beforeAuth={() =>
            store.getSnapshot().record.sessions.length && !store.getSnapshot().saved
              ? 'Save your logs on this device before signing in. They are still here.'
              : null
          }
          retrySaving={() => {
            if (writable) store.retrySave();
          }}
        />
      ) : null}
      {storageIssue ? (
        <div className="notice-box" role="status">
          {storageIssue}
          <Button type="button" variant="ghost" onClick={retry}>
            Try this tab again
          </Button>
        </div>
      ) : null}
      {history ? (
        <>
          {historySessions.length ? (
            historySessions.map((s) => (
              <Card key={s.id} className="stack">
                <span className="pill">Quick Log session</span>
                <h2>{quickCountLabel(availableQuickEntries(s))}</h2>
                {availableQuickEntries(s).some((e) => e.kind === 'shot') ? (
                  <p className="muted small">
                    Includes {availableQuickEntries(s).filter((e) => e.kind === 'shot').length}{' '}
                    shots.
                  </p>
                ) : null}
                <p className="muted small">Drink sizes and alcohol strength not recorded.</p>
                <p className="muted small">
                  {new Date(s.createdAt).toLocaleString()} ·{' '}
                  {s.state === 'active' ? 'In progress' : 'Finished'}
                </p>
                <Link
                  className="button button-secondary"
                  href={`/quick-log?scope=${store.scope === 'guest' ? 'guest' : 'account'}&sessionId=${s.id}`}
                >
                  Open session
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={
                    !writable ||
                    unresolvedQuickTransfers(state.record).some((o) => o.sessionId === s.id)
                  }
                  onClick={() =>
                    run(() => {
                      if (
                        s.entries.length &&
                        !window.confirm(
                          store.scope !== 'guest'
                            ? 'Remove this device’s copy? Your account history is kept and may restore it when syncing.'
                            : s.entries.some((e) => e.destination)
                              ? 'Delete this local session? Entries already added to a night stay in that night.'
                              : 'Delete this local session and its entries?',
                        )
                      )
                        return;
                      store.deleteSession(s.id);
                    })
                  }
                >
                  Delete local session
                </Button>
              </Card>
            ))
          ) : (
            <p className="muted">No past quick sessions yet.</p>
          )}
        </>
      ) : (
        <>
          <div className={styles['totals']}>
            <p className={styles['summary']}>{quickCountLabel(entries)}</p>
            {entries.length ? (
              <p className="muted small">
                {readOnly ? 'Session finished' : quickRelativeTime(current, now)}
              </p>
            ) : null}
          </div>
          {stale && current ? (
            <Card className="stack">
              <p>
                Session from{' '}
                {new Date(current.createdAt).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
              <Button type="button" onClick={() => setContinued(current.id)}>
                Continue this session
              </Button>
              <Button type="button" variant="secondary" disabled={!writable} onClick={startNew}>
                Start new
              </Button>
            </Card>
          ) : null}
          {!state.record.eligible && !readOnly ? (
            <label className={styles['eligibility']}>
              <input
                type="checkbox"
                checked={false}
                disabled={!writable || state.blocked}
                onChange={() => run(() => store.acknowledgeEligibility())}
              />
              I am 18 or older and meet the local legal drinking age.
            </label>
          ) : null}
          <div className={styles['logControl']}>
            <Button
              type="button"
              className={styles['tap']}
              disabled={!enabled}
              onClick={() => log('drink')}
              aria-label="Log one drink"
            >
              <Plus size={52} strokeWidth={1.7} aria-hidden="true" />
              <span>Log drink</span>
            </Button>
            <p className={styles['announcement']} role="status" aria-live="polite">
              {message}
            </p>
            <div className={styles['secondaryActions']}>
              <Button
                type="button"
                variant="secondary"
                disabled={!enabled}
                onClick={() => log('chaser')}
                aria-label="Log one non-alcoholic chaser"
              >
                <GlassWater size={20} aria-hidden="true" /> Chaser
              </Button>
              <Button
                type="button"
                variant="ghost"
                aria-label="Undo last action"
                disabled={!writable || !canUndo}
                onClick={() =>
                  run(() => {
                    if (undo) store.undo(undo);
                    setMessage('Action undone');
                  })
                }
              >
                <Undo2 size={18} aria-hidden="true" /> Undo
              </Button>
            </div>
            <p className="muted small">Chasers are non-alcoholic.</p>
          </div>
          <details className={styles['recent']}>
            <summary>
              Recent activity <ChevronDown size={18} aria-hidden="true" />
            </summary>
            {!entries.length ? <p className="muted small">No entries yet.</p> : null}
            {entries.map((e) => (
              <div key={e.id} className={styles['entry']}>
                <strong>
                  {quickKindLabel(e.kind)} ·{' '}
                  {new Date(e.recordedAt).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </strong>
                {e.destination ? (
                  <Link href={`/night/${e.destination.nightId}`}>
                    Added to a night · Open night
                  </Link>
                ) : quickEntryLocked(state.record, e) ? (
                  <p className="muted small">Checking whether this entry was added</p>
                ) : !readOnly ? (
                  <div className={styles['controls']}>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={!writable}
                      onClick={() =>
                        run(() => {
                          store.correct(e.sessionId, e.id, quickCorrectionKind(e.kind));
                          setMessage('Entry corrected');
                        })
                      }
                    >
                      Change to {quickKindLabel(quickCorrectionKind(e.kind))}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={!writable}
                      onClick={() =>
                        run(() => {
                          store.correct(e.sessionId, e.id, 'remove');
                          setMessage('Entry removed');
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </details>
          <Button
            type="button"
            variant="secondary"
            disabled={
              !writable ||
              !current ||
              (!pending && !availableQuickEntries(current).length) ||
              state.blocked
            }
            onClick={add}
          >
            {pending ? 'Check adding logs to a night' : 'Add to a night'}
          </Button>
          {!readOnly ? (
            <Button
              type="button"
              variant="ghost"
              disabled={!writable || !current}
              onClick={() =>
                run(() => {
                  if (current) {
                    store.finish(current.id);
                    setSelected(current.id);
                    setMessage('Session finished');
                  }
                })
              }
            >
              Finish session
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" disabled={!writable} onClick={startNew}>
                Start another session
              </Button>
              {!current.entries.some((e) => e.destination) && !pending ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!writable}
                  onClick={() =>
                    run(() => {
                      store.reopen(current.id);
                    })
                  }
                >
                  Reopen session
                </Button>
              ) : null}
            </>
          )}
        </>
      )}
      {syncIssue && account ? (
        <div className="notice-box" role="status">
          {syncIssue}
          <Button type="button" variant="ghost" onClick={retrySync}>
            Retry account saving
          </Button>
        </div>
      ) : null}
      {issue || state.issue ? (
        <div className="error-box" role="alert">
          {issue ?? state.issue}
          {state.issue ? (
            <Button
              type="button"
              variant="ghost"
              disabled={!writable}
              onClick={() => store.retrySave()}
            >
              Retry saving
            </Button>
          ) : null}
        </div>
      ) : null}
      {!history ? <QuickLogAds /> : null}
    </div>
  );
}
