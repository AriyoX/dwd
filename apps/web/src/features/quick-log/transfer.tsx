'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  availableQuickEntries,
  quickCountLabel,
  unresolvedQuickTransfers,
  type ActiveNightSummary,
  type NightSnapshot,
} from '@dwd/core';
import { executeQuickTransfer, type QuickLogStore } from '@dwd/contracts';
import { getActiveNights, getNightSnapshot, importQuickLogs } from '@dwd/data';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { JoinCodeForm } from '@/features/nights/join-code-form';
import { useBrowserQuickLog, useQuickStoreState } from './provider';

export function QuickTransferScreen() {
  const { store, session } = useBrowserQuickLog();
  if (!store) return <p role="status">Opening device logs…</p>;
  return <Transfer key={`${store.scope}:${session?.user.id ?? 'guest'}`} store={store} />;
}
function Transfer({ store }: { store: QuickLogStore }) {
  const state = useQuickStoreState(store);
  const { client, session, writable, issue: storageIssue } = useBrowserQuickLog();
  const params = useSearchParams();
  const router = useRouter();
  const owner = useRef(session?.user.id ?? null);
  useLayoutEffect(() => {
    owner.current = session?.user.id ?? null;
  }, [session]);
  const [nights, setNights] = useState<ActiveNightSummary[]>([]);
  const [destination, setDestination] = useState<NightSnapshot | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [joining, setJoining] = useState(false);
  const [online, setOnline] = useState(true);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const quick = store.session(params.get('sessionId') ?? state.record.intent?.sessionId);
  const intent = state.record.intent?.sessionId === quick?.id ? state.record.intent : null;
  const pending = unresolvedQuickTransfers(state.record).find((o) => o.sessionId === quick?.id);
  const nightId = pending?.nightId ?? params.get('nightId') ?? intent?.nightId;
  const entries = pending?.entries ?? availableQuickEntries(quick).slice(0, 500);
  const suffix = `scope=${store.scope === 'guest' ? 'guest' : 'account'}${quick ? `&sessionId=${quick.id}` : ''}`;
  const path = `/quick-log/add?${suffix}${nightId ? `&nightId=${nightId}` : ''}`;
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    if (!client || !session || !online || (pending && pending.accountId !== session.user.id))
      return;
    let alive = true;
    void (nightId ? getNightSnapshot(client, nightId) : getActiveNights(client))
      .then((result) => {
        if (alive) {
          if (Array.isArray(result)) setNights(result);
          else setDestination(result);
        }
      })
      .catch(() => {
        if (alive)
          setIssue(
            'Couldn’t load your nights. Go online and try again. Your quick logs are still here.',
          );
      });
    return () => {
      alive = false;
    };
  }, [client, session, online, nightId, pending]);
  async function choose(id: string) {
    if (!client || !session || !quick || inFlight.current || !writable) return;
    inFlight.current = true;
    setBusy(true);
    setIssue(null);
    const accountId = session.user.id;
    try {
      const result = await getNightSnapshot(client, id);
      if (owner.current !== accountId) return;
      store.setIntent({ sessionId: quick.id, accountId, nightId: id, destination: 'choose' });
      if (!store.getSnapshot().saved) throw new Error('Couldn’t save on this device');
      setDestination(result);
    } catch {
      setIssue('Couldn’t open this night. Your quick logs are still here.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function add() {
    if (!client || !session || !quick || inFlight.current || !writable) return;
    if (!online) {
      setIssue('Go online to add this to a night');
      return;
    }
    const targetNight = pending?.nightId ?? destination?.night.id;
    const targetMember = pending?.memberId ?? destination?.currentMemberId;
    if (!targetNight || !targetMember) return;
    inFlight.current = true;
    setBusy(true);
    setIssue(null);
    try {
      const operation = store.prepareTransfer(quick.id, session.user.id, targetNight, targetMember);
      // Freeze this request's bearer token even if the browser changes accounts in flight.
      const scoped = Object.create(client) as typeof client;
      scoped.rpc = (fn, args, options) =>
        client
          .rpc(fn, args, options)
          .setHeader('Authorization', `Bearer ${session.access_token}`)
          .abortSignal(AbortSignal.timeout(20_000));
      const receipt = await executeQuickTransfer(
        store,
        operation,
        () => (mounted.current ? owner.current : null),
        online,
        (o) => importQuickLogs(scoped, o),
      );
      router.replace(`/night/${receipt.nightId}`);
    } catch (e) {
      setIssue(
        e instanceof Error && /account|device|online|previous/.test(e.message)
          ? e.message
          : 'Couldn’t confirm that the entries were added. Try again to check the same entries. Your logs are kept.',
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  function upgrade(kind: 'invite' | 'create') {
    if (!session || !quick || !writable || inFlight.current) return;
    try {
      store.setIntent({
        sessionId: quick.id,
        accountId: session.user.id,
        nightId: null,
        destination: kind,
      });
      if (!store.getSnapshot().saved) throw new Error('Couldn’t save on this device');
      if (kind === 'create') router.push('/night/new');
      else setJoining(true);
    } catch {
      setIssue('Couldn’t save on this device. Retry saving before continuing.');
    }
  }
  return (
    <div className="stack-lg">
      <h1>Add to a night</h1>
      <Card className="stack">
        <h2>{quickCountLabel(entries)}</h2>
        <p className="muted small">
          Sizes and strengths remain unknown. These are recording times, not verified consumption
          times.
        </p>
        {availableQuickEntries(quick).length > 500 ? (
          <p className="muted small">
            The first 500 entries will be added. You can add the remaining entries afterwards.
          </p>
        ) : null}
      </Card>
      {!quick ? (
        <p>Open a quick session to choose entries.</p>
      ) : !session ? (
        <Link className="button button-primary" href={`/login?next=${encodeURIComponent(path)}`}>
          Sign in to add logs
        </Link>
      ) : pending && pending.accountId !== session.user.id ? (
        <p>Sign in to the account that started adding these logs to check the result.</p>
      ) : (
        <>
          {!online ? <p role="status">Go online to add this to a night</p> : null}
          {destination ? (
            <Card className="stack">
              <h2>{destination.night.title}</h2>
              <p>
                {destination.night.status === 'ended'
                  ? 'This night has ended.'
                  : 'These entries will be added to your own log.'}
              </p>
              <Button
                type="button"
                full
                disabled={
                  !writable ||
                  busy ||
                  !online ||
                  !entries.length ||
                  (!pending && destination.night.status !== 'active')
                }
                onClick={() => void add()}
              >
                {busy ? 'Adding…' : pending ? 'Check result and add logs' : 'Confirm and add logs'}
              </Button>
            </Card>
          ) : pending ? (
            <Button
              type="button"
              disabled={!writable || busy || !online}
              onClick={() => void add()}
            >
              Check result and add logs
            </Button>
          ) : (
            <>
              <h2>Your active nights</h2>
              {nights.map((n) => (
                <Button
                  key={n.id}
                  type="button"
                  variant="secondary"
                  disabled={!writable || busy}
                  onClick={() => void choose(n.id)}
                >
                  {n.title}
                </Button>
              ))}
              <Button
                type="button"
                variant="secondary"
                disabled={!writable}
                onClick={() => upgrade('invite')}
              >
                Join with an invite link
              </Button>
              {joining ? <JoinCodeForm /> : null}
              <Button
                type="button"
                variant="secondary"
                disabled={!writable}
                onClick={() => upgrade('create')}
              >
                Create a night
              </Button>
            </>
          )}
        </>
      )}
      {issue || state.issue || storageIssue ? (
        <div className="error-box" role="alert">
          {issue ?? state.issue ?? storageIssue}
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
      <Link className="button button-ghost" href={`/quick-log?${suffix}`}>
        Not now · Back to Quick Log
      </Link>
    </div>
  );
}
