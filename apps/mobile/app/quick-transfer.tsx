import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  availableQuickEntries,
  quickCountLabel,
  quickLinkedNight,
  unresolvedQuickTransfers,
  type ActiveNightSummary,
  type NightSnapshot,
} from '@dwd/core';
import { executeQuickTransfer } from '@dwd/contracts';
import { getActiveNights, getNightSnapshot, importQuickLogs } from '@dwd/data';
import { useQuickLog } from '@/hooks/use-quick-log';
import { useSupabase } from '@/providers/supabase-provider';
import { useConnectivity } from '@/providers/connectivity-provider';
import { useTheme } from '@/providers/theme-provider';
import { PrimaryButton } from '@/components/primary-button';
import { Notice, Panel, Screen, ScreenHeading } from '@/components/screen';
import { actorClient } from '@/lib/actor-client';
import { withRequestTimeout } from '@/lib/request-timeout';
import { authHandoff } from '@/lib/auth-state';

export default function QuickTransferScreen() {
  const params = useLocalSearchParams<{ scope?: string; sessionId?: string; nightId?: string }>();
  const { session } = useSupabase();
  return (
    <Transfer
      key={`${session?.user.id ?? 'guest'}:${params.scope}:${params.sessionId}:${params.nightId}`}
      params={params}
    />
  );
}
function Transfer({
  params,
}: {
  params: { scope?: string; sessionId?: string; nightId?: string };
}) {
  const { store, state, scope } = useQuickLog(params.scope === 'guest', params.sessionId);
  const { client, session } = useSupabase();
  const { online } = useConnectivity();
  const { typography } = useTheme();
  const router = useRouter();
  const currentAccount = useRef(session?.user.id ?? null);
  useLayoutEffect(() => {
    currentAccount.current = session?.user.id ?? null;
  }, [session]);
  const quick = store.session(params.sessionId ?? state.record.intent?.sessionId);
  const intent = state.record.intent?.sessionId === quick?.id ? state.record.intent : null;
  const pending = unresolvedQuickTransfers(state.record).find((o) => o.sessionId === quick?.id);
  const [nights, setNights] = useState<ActiveNightSummary[]>([]);
  const [destination, setDestination] = useState<NightSnapshot | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const nightId =
    pending?.nightId ?? quickLinkedNight(quick)?.nightId ?? params.nightId ?? intent?.nightId;
  const back = () =>
    router.replace({
      pathname: '/quick-log',
      params: {
        scope: scope === 'guest' ? 'guest' : 'account',
        ...(quick ? { sessionId: quick.id } : {}),
      },
    });
  const path = `/quick-transfer?scope=${scope === 'guest' ? 'guest' : 'account'}${quick ? `&sessionId=${quick.id}` : ''}${nightId ? `&nightId=${nightId}` : ''}`;
  useEffect(() => {
    if (
      !client ||
      !session ||
      online === false ||
      (pending && pending.accountId !== session.user.id)
    )
      return;
    let alive = true;
    void withRequestTimeout<NightSnapshot | ActiveNightSummary[]>(() =>
      nightId ? getNightSnapshot(client, nightId) : getActiveNights(client),
    )
      .then((result) => {
        if (!alive) return;
        if (Array.isArray(result)) setNights(result);
        else setDestination(result);
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
    if (!client || !session || !quick || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setIssue(null);
    const owner = session.user.id;
    try {
      const result = await withRequestTimeout(() =>
        getNightSnapshot(actorClient(client, session.access_token), id),
      );
      if (currentAccount.current !== owner) return;
      store.setIntent({
        sessionId: quick.id,
        accountId: owner,
        nightId: id,
        destination: 'choose',
      });
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
    if (!client || !session || !quick || inFlight.current) return;
    if (online === false) {
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
      const receipt = await executeQuickTransfer(
        store,
        operation,
        () => (mounted.current ? currentAccount.current : null),
        true,
        (o) =>
          withRequestTimeout((signal) =>
            importQuickLogs(actorClient(client, session.access_token, signal), o),
          ),
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
  function upgrade(destinationKind: 'invite' | 'create') {
    if (!quick || !session || inFlight.current) return;
    try {
      store.setIntent({
        sessionId: quick.id,
        accountId: session.user.id,
        nightId: null,
        destination: destinationKind,
      });
      if (!store.getSnapshot().saved) throw new Error('Couldn’t save on this device');
      router.replace(destinationKind === 'invite' ? '/join' : '/night/new');
    } catch {
      setIssue('Couldn’t save on this device. Retry saving before continuing.');
    }
  }
  const entries = pending?.entries ?? availableQuickEntries(quick).slice(0, 500);
  return (
    <Screen insetTop={false} hidePermissionReminder>
      <ScreenHeading title="Add to a night" />
      <Panel>
        <Text style={typography.sectionTitle}>{quickCountLabel(entries)}</Text>
        <Notice message="Earlier drinks keep their counts. New drinks will use your night’s plan." />
        {availableQuickEntries(quick).length > 500 ? (
          <Notice message="The first 500 entries will be added. You can add the remaining entries afterwards." />
        ) : null}
      </Panel>
      {!quick ? (
        <Notice message="Open a quick session to choose entries." />
      ) : !session ? (
        <Panel>
          <PrimaryButton
            label="Sign in to add logs"
            onPress={() => {
              try {
                store.setIntent({
                  sessionId: quick.id,
                  accountId: null,
                  nightId: nightId ?? null,
                  destination: 'choose',
                });
                if (!store.getSnapshot().saved) throw new Error('Couldn’t save on this device');
                authHandoff().remember(path);
                router.replace('/auth/sign-in');
              } catch {
                setIssue('Couldn’t save on this device. Retry saving before continuing.');
              }
            }}
          />
        </Panel>
      ) : pending && pending.accountId !== session.user.id ? (
        <Notice message="Sign in to the account that started adding these logs to check the result." />
      ) : (
        <>
          {online === false ? <Notice message="Go online to add this to a night" /> : null}
          {destination ? (
            <Panel>
              <Text style={typography.sectionTitle}>{destination.night.title}</Text>
              <Notice
                message={
                  destination.night.status === 'ended'
                    ? 'This night has ended.'
                    : 'These entries will be added to your own log.'
                }
              />
              <PrimaryButton
                label={pending ? 'Check saved logs' : 'Add my logs'}
                disabled={
                  !entries.length ||
                  online === false ||
                  (!pending && destination.night.status !== 'active')
                }
                busy={busy}
                onPress={() => void add()}
              />
            </Panel>
          ) : pending ? (
            <PrimaryButton
              label="Check saved logs"
              busy={busy}
              disabled={online === false}
              onPress={() => void add()}
            />
          ) : (
            <>
              <Text style={typography.sectionTitle}>Your active nights</Text>
              {nights.map((n) => (
                <PrimaryButton
                  key={n.id}
                  label={n.title}
                  variant="secondary"
                  busy={busy}
                  onPress={() => void choose(n.id)}
                />
              ))}
              <PrimaryButton
                label="Join with an invite link"
                variant="secondary"
                onPress={() => upgrade('invite')}
              />
              <PrimaryButton
                label="Create a night"
                variant="secondary"
                onPress={() => upgrade('create')}
              />
            </>
          )}
        </>
      )}
      {issue || state.issue ? <Notice error message={issue ?? state.issue ?? ''} /> : null}
      {state.issue ? (
        <PrimaryButton label="Retry saving" variant="secondary" onPress={() => store.retrySave()} />
      ) : null}
      <PrimaryButton label="Not now · Back to Quick Log" variant="quiet" onPress={back} />
    </Screen>
  );
}
