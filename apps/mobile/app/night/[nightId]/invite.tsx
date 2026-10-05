import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Share, Text } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { canUserEndOrExtendNight } from '@dwd/core';
import {
  DataAccessError,
  createNightInvite,
  getInvitePreview,
  revokeNightInviteOnce,
  rotateNightInvite,
} from '@dwd/data';
import { PrimaryButton } from '@/components/primary-button';
import { LoadingPanel, Notice, Panel, RetryPanel, Screen } from '@/components/screen';
import { useNight } from '@/hooks/use-night';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme } from '@/providers/theme-provider';
import { actorClient } from '@/lib/actor-client';
import { confirmAction } from '@/lib/confirm';
import { hashInvite, newInviteToken } from '@/lib/invites';
import {
  completedInviteOperation,
  inviteStateKey,
  readInviteState,
  type InviteOperation,
  type InviteState,
} from '@/lib/invite-state';
import { siteUrl } from '@/lib/site';
import { withRequestTimeout } from '@/lib/request-timeout';

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
  const { typography } = useTheme();
  const currentOwner = useRef(owner);
  useLayoutEffect(() => {
    currentOwner.current = session?.user.id ?? '';
  }, [session]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [state, setState] = useState<InviteState>({
    owner,
    nightId,
    token: null,
    expiresAt: null,
    pending: null,
  });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const active = () => mounted.current && currentOwner.current === owner;
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        setState(readInviteState(globalThis.localStorage, owner, nightId));
      } catch {
        setMessage('Could not restore the local link. Replace or revoke links to regain control.');
      }
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [owner, nightId]);
  const host =
    snapshot &&
    canUserEndOrExtendNight(owner, snapshot.night) &&
    snapshot.night.status === 'active';
  useFocusEffect(
    useCallback(() => {
      if (!client || !session || !ready || !state.token || state.pending) return;
      let active = true;
      const token = state.token;
      void withRequestTimeout(async (signal) =>
        getInvitePreview(
          actorClient(client, session.access_token, signal),
          await hashInvite(token),
        ),
      )
        .then((preview) => {
          if (active && !preview.valid) {
            setState((value) => ({ ...value, token: null, expiresAt: null }));
            setMessage('The saved link is no longer active. Create a new link.');
          }
        })
        .catch(() => {
          if (active)
            setMessage('Could not verify the saved link. Check your connection before sharing.');
        });
      return () => {
        active = false;
      };
    }, [client, session, ready, state.token, state.pending]),
  );
  function persist(next: InviteState) {
    globalThis.localStorage.setItem(inviteStateKey(owner, nightId), JSON.stringify(next));
    setState(next);
  }
  async function mutate(kind: InviteOperation['kind']) {
    if (!client || !session || !host || inFlight.current || !active()) return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    setFailed(false);
    try {
      const operation = state.pending ?? {
        kind,
        token: await newInviteToken(),
        expiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
      };
      if (!active()) return;
      persist({ ...state, pending: operation });
      const hash = await hashInvite(operation.token);
      if (!active()) return;
      const connection = actorClient(client, session.access_token);
      let expiresAt = operation.expiresAt;
      if (operation.kind === 'revoke')
        await withRequestTimeout(() => revokeNightInviteOnce(connection, nightId, hash));
      else {
        const input = { nightId, tokenHash: hash, expiresAt, maxUses: null };
        const result = await withRequestTimeout(() =>
          operation.kind === 'replace'
            ? rotateNightInvite(connection, input)
            : createNightInvite(connection, input),
        );
        expiresAt = result.expiresAt;
      }
      if (!active()) return;
      persist(completedInviteOperation(state, operation, expiresAt));
      setMessage(
        operation.kind === 'revoke'
          ? 'Invitation links are off.'
          : operation.kind === 'replace'
            ? 'New link ready. Earlier links no longer work.'
            : 'Your invitation link is ready.',
      );
    } catch (error) {
      if (active()) {
        setFailed(true);
        if (
          error instanceof DataAccessError &&
          (error.code === '55000' || error.code === '22023')
        ) {
          persist({ ...state, pending: null, token: null, expiresAt: null });
          setMessage('That invitation request is no longer active. Create or replace links again.');
        } else
          setMessage('Could not confirm the invitation change. Retry to finish the same request.');
      }
    } finally {
      inFlight.current = false;
      if (active()) setBusy(false);
    }
  }
  const url =
    state.token && state.expiresAt && Date.parse(state.expiresAt) > now
      ? `${siteUrl()}/join/${state.token}`
      : null;
  async function share(copy: boolean) {
    if (!url || !state.token || !client || !session || !host || state.pending || inFlight.current)
      return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    let verified = false;
    try {
      const tokenHash = await hashInvite(state.token);
      const preview = await withRequestTimeout((signal) =>
        getInvitePreview(actorClient(client, session.access_token, signal), tokenHash),
      );
      if (!active()) return;
      if (!preview.valid) {
        persist({ ...state, token: null, expiresAt: null });
        setMessage('This link is no longer active. Create a new link.');
        return;
      }
      verified = true;
      if (copy) {
        await Clipboard.setStringAsync(url);
        setMessage('Invitation link copied.');
      } else
        await Share.share({
          title: `Join ${snapshot.night.title}`,
          message: `Join ${snapshot.night.title} on DWD: ${url}`,
          url,
        });
    } catch {
      if (active())
        setMessage(
          verified
            ? 'Sharing did not complete. Retry or copy the link.'
            : 'Could not verify this link. Retry sharing when connected.',
        );
    } finally {
      inFlight.current = false;
      if (active()) setBusy(false);
    }
  }
  return (
    <Screen insetTop={false} sheetTitle="Invite people">
      {!snapshot ? (
        issue ? (
          <RetryPanel issue={issue} retry={() => void refresh()} />
        ) : (
          <LoadingPanel />
        )
      ) : !host ? (
        <Notice message="Only the host of an active night can manage invitations." />
      ) : (
        <>
          <Notice message="Friends join and log their own drinks. Anyone with this private link can join until it expires." />
          {url && !state.pending ? (
            <Panel>
              <Text style={typography.sectionTitle}>Your invitation link</Text>
              <Text selectable style={typography.body}>
                {url}
              </Text>
              <Text style={typography.body}>
                Expires {new Date(state.expiresAt ?? '').toLocaleString()}
              </Text>
              <PrimaryButton
                label="Share link"
                icon="share-outline"
                busy={busy}
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
          ) : null}
          {state.pending ? (
            <PrimaryButton
              label={`Retry ${state.pending.kind === 'replace' ? 'replacement' : state.pending.kind}`}
              busy={busy}
              onPress={() => {
                if (state.pending) void mutate(state.pending.kind);
              }}
            />
          ) : (
            <>
              {!url ? (
                <PrimaryButton
                  label="Create invitation link"
                  icon="link-outline"
                  busy={busy}
                  disabled={!ready}
                  onPress={() => void mutate('create')}
                />
              ) : null}
              <PrimaryButton
                label="Replace invitation links"
                icon="refresh-outline"
                variant="secondary"
                disabled={busy || !ready}
                onPress={() =>
                  void (async () => {
                    if (
                      await confirmAction(
                        'Replace invitation links?',
                        'Earlier links will stop working. People already in the night stay joined.',
                        'Replace links',
                      )
                    )
                      await mutate('replace');
                  })()
                }
              />
              <PrimaryButton
                label="Revoke all invitation links"
                icon="unlink-outline"
                variant="danger"
                disabled={busy || !ready}
                onPress={() =>
                  void (async () => {
                    if (
                      await confirmAction(
                        'Revoke invitation links?',
                        'New people cannot join with existing links. People already in the night stay joined.',
                        'Revoke links',
                        true,
                      )
                    )
                      await mutate('revoke');
                  })()
                }
              />
            </>
          )}
        </>
      )}
      {message ? <Notice error={failed} message={message} /> : null}
    </Screen>
  );
}
