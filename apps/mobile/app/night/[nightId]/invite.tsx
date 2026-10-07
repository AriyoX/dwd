import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Linking, Share, Text } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { canUserEndOrExtendNight } from '@dwd/core';
import { Disclosure } from '@/components/disclosure';
import { PrimaryButton } from '@/components/primary-button';
import { NavigationRow } from '@/components/navigation-row';
import { LoadingPanel, Notice, Panel, RetryPanel, Screen } from '@/components/screen';
import { useNight } from '@/hooks/use-night';
import { useSupabase } from '@/providers/supabase-provider';
import { useConnectivity } from '@/providers/connectivity-provider';
import { useTheme } from '@/providers/theme-provider';
import { actorClient } from '@/lib/actor-client';
import { confirmAction } from '@/lib/confirm';
import { refreshNightInvite } from '@/lib/automatic-invite';
import { readInviteState, type InviteOperation, type InviteState } from '@/lib/invite-state';
import { siteUrl } from '@/lib/site';

export default function InviteScreen() {
  const { nightId } = useLocalSearchParams<{ nightId: string }>();
  const { session } = useSupabase();
  return session ? (
    <Invitation key={`${session.user.id}:${nightId}`} owner={session.user.id} nightId={nightId} />
  ) : null;
}

function Invitation({ owner, nightId }: { owner: string; nightId: string }) {
  const { snapshot, issue, refresh, now } = useNight(nightId);
  const { client, session } = useSupabase();
  const { online } = useConnectivity();
  const { typography } = useTheme();
  const [state, setState] = useState<InviteState>(() => {
    try {
      return readInviteState(globalThis.localStorage, owner, nightId);
    } catch {
      return readInviteState({ getItem: () => null }, owner, nightId);
    }
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);
  const currentOwner = useRef(owner);
  const inFlight = useRef(false);
  useLayoutEffect(() => {
    currentOwner.current = session?.user.id ?? '';
  }, [session]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const host = Boolean(
    snapshot &&
    canUserEndOrExtendNight(owner, snapshot.night) &&
    snapshot.night.status === 'active',
  );
  const accessToken = session?.access_token;
  const change = useCallback(
    async (kind?: InviteOperation['kind']) => {
      if (
        !client ||
        !accessToken ||
        !host ||
        inFlight.current ||
        !mounted.current ||
        currentOwner.current !== owner
      )
        return;
      if (online === false) {
        if (kind) {
          setFailed(false);
          setMessage('Connect to the internet to change this invite.');
          return;
        }
        try {
          const saved = readInviteState(globalThis.localStorage, owner, nightId);
          setState(saved);
          const ready =
            saved.token &&
            saved.expiresAt &&
            Date.parse(saved.expiresAt) > Date.now() &&
            !saved.pending;
          setFailed(!ready && !saved.disabled);
          setMessage(
            ready || saved.disabled
              ? null
              : "You're offline. Your invite will be ready when you're back online.",
          );
        } catch {
          setFailed(true);
          setMessage("Couldn't open your saved invite. Try again.");
        }
        return;
      }
      inFlight.current = true;
      setBusy(true);
      setMessage(null);
      setFailed(false);
      const valid = () => mounted.current && currentOwner.current === owner;
      try {
        const connection = actorClient(client, accessToken);
        const next = await refreshNightInvite(
          globalThis.localStorage,
          connection,
          owner,
          nightId,
          kind,
        );
        if (!valid()) return;
        setState(next);
      } catch {
        if (!valid()) return;
        setFailed(true);
        try {
          const saved = readInviteState(globalThis.localStorage, owner, nightId);
          setState(saved);
          setMessage("Couldn't prepare your invite. We'll try again when you're online.");
        } catch {
          setMessage("Couldn't save your invite on this phone. Try again.");
        }
      } finally {
        inFlight.current = false;
        if (valid()) setBusy(false);
      }
    },
    [client, accessToken, host, owner, nightId, online],
  );
  useFocusEffect(
    useCallback(() => {
      void change();
    }, [change]),
  );
  useEffect(() => {
    if (!state.expiresAt || state.disabled || state.pending || online === false) return;
    const delay = Math.max(failed ? 30_000 : 0, Date.parse(state.expiresAt) - Date.now());
    const timer = setTimeout(() => void change(), Math.min(delay, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [state.expiresAt, state.disabled, state.pending, online, failed, change]);
  const url =
    state.token && state.expiresAt && Date.parse(state.expiresAt) > now
      ? `${siteUrl()}/join/${state.token}`
      : null;
  async function share(copy: boolean) {
    if (!url || busy || state.pending) return;
    setMessage(null);
    setFailed(false);
    try {
      if (copy) {
        await Clipboard.setStringAsync(url);
        setMessage('Invite copied.');
      } else
        await Share.share({
          title: 'Join my night on DWD',
          message: `Join ${snapshot?.night.title ?? 'my night'} on DWD: ${url}`,
        });
    } catch {
      setMessage("Couldn't share your invite. Try again or copy the link.");
    }
  }
  return (
    <Screen insetTop={false} sheetTitle="Invite friends">
      {!snapshot ? (
        issue ? (
          <RetryPanel issue={issue} retry={() => void refresh()} />
        ) : (
          <LoadingPanel />
        )
      ) : !host ? (
        <Notice message="Only the host can share invites for an active night." />
      ) : (
        <>
          <Notice message="Anyone with your link can join and log their own drinks." />
          {url && !state.pending ? (
            <Panel>
              <Text style={typography.sectionTitle}>Invite ready</Text>
              <Text style={typography.body}>
                Until{' '}
                {new Date(state.expiresAt ?? '').toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </Text>
              <PrimaryButton
                large
                label="Share invite"
                icon="share-outline"
                disabled={busy}
                onPress={() => void share(false)}
              />
              <PrimaryButton
                label="Copy link"
                icon="copy-outline"
                variant="secondary"
                disabled={busy}
                onPress={() => void share(true)}
              />
            </Panel>
          ) : busy ? (
            <LoadingPanel />
          ) : state.disabled ? (
            <Notice message="Invitation links are off." />
          ) : (
            <Notice message="Preparing your invite…" />
          )}
          {message ? <Notice dismissible message={message} /> : null}
          {failed || state.pending ? (
            <PrimaryButton
              label="Try again"
              variant="secondary"
              busy={busy}
              onPress={() => void change()}
            />
          ) : null}
          {!state.pending ? (
            <Disclosure title="Invite options" defaultExpanded={state.disabled}>
              <PrimaryButton
                label={state.disabled ? 'Use a new link' : 'Replace link'}
                icon="refresh-outline"
                variant="quiet"
                disabled={busy || online === false}
                onPress={() =>
                  void (async () => {
                    if (
                      state.disabled ||
                      (await confirmAction(
                        'Replace this invite?',
                        'The old link will stop working. Friends already joined stay in the night.',
                        'Replace link',
                      ))
                    )
                      await change('replace');
                  })()
                }
              />
              {url ? (
                <NavigationRow
                  label="Open invitation"
                  icon="open-outline"
                  onPress={() =>
                    void Linking.openURL(url).catch(() =>
                      setMessage("Couldn't open your invite. Try again."),
                    )
                  }
                />
              ) : null}
              {!state.disabled ? (
                <PrimaryButton
                  label="Turn off invites"
                  variant="danger"
                  disabled={busy || online === false}
                  onPress={() =>
                    void (async () => {
                      if (
                        await confirmAction(
                          'Turn off invitations?',
                          'New friends cannot join with this link. Friends already joined stay in the night.',
                          'Turn off link',
                          true,
                        )
                      )
                        await change('revoke');
                    })()
                  }
                />
              ) : null}
            </Disclosure>
          ) : null}
        </>
      )}
    </Screen>
  );
}
