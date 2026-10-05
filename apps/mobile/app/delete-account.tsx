import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import { cancelAccountDeletion, getAccountDeletion, scheduleAccountDeletion } from '@dwd/data';
import { PrimaryButton } from '@/components/primary-button';
import {
  LoadingPanel,
  Notice,
  Panel,
  RetryPanel,
  Screen,
  ScreenHeading,
} from '@/components/screen';
import { SettingsRow } from '@/components/settings-row';
import { useAccountQuery } from '@/hooks/use-account-query';
import { actorClient } from '@/lib/actor-client';
import { authHandoff } from '@/lib/auth-state';
import { clearDeletedAccountData } from '@/lib/account-cleanup';
import { confirmAction } from '@/lib/confirm';
import { withRequestTimeout } from '@/lib/request-timeout';
import { useSupabase } from '@/providers/supabase-provider';
import { useNotifications } from '@/providers/notifications-provider';
import { useOffline } from '@/providers/offline-provider';
import { useTheme } from '@/providers/theme-provider';

export default function DeleteAccountScreen() {
  const { session } = useSupabase();
  return session ? <Deletion key={session.user.id} /> : null;
}
function Deletion() {
  const query = useAccountQuery(getAccountDeletion);
  const { client, session } = useSupabase();
  const notifications = useNotifications();
  const offline = useOffline();
  const { typography } = useTheme();
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inFlight = useRef(false);
  const owner = session?.user.id;
  const currentOwner = useRef(owner);
  const mounted = useRef(true);
  useLayoutEffect(() => {
    currentOwner.current = owner;
  }, [owner]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const active = () => mounted.current && currentOwner.current === owner;
  async function signOut() {
    if (!client || !session || !active()) return;
    // Scheduling is already complete. A failed logout must offer logout retry only.
    await notifications.deactivate();
    if (!active()) return;
    const { error } = await client.auth.signOut({ scope: 'global' });
    if (error) throw error;
    offline.outbox?.dispose();
    clearDeletedAccountData(globalThis.localStorage, session.user.id);
    authHandoff().clear();
    router.replace('/auth/sign-in');
  }
  async function submit(cancel: boolean) {
    if (!client || !session || inFlight.current || !active()) return;
    if (
      !cancel &&
      !scheduled &&
      !query.data &&
      !(await confirmAction(
        'Delete your account?',
        'Deletion is scheduled in 30 days. Signing in before deletion starts cancels it. Shared nights retain anonymous records.',
        'Schedule deletion',
        true,
      ))
    )
      return;
    if (!active()) return;
    inFlight.current = true;
    setBusy(true);
    setIssue(null);
    try {
      const connection = actorClient(client, session.access_token);
      if (cancel) {
        await withRequestTimeout(() => cancelAccountDeletion(connection));
        if (!active()) return;
        setScheduled(null);
        setNotice('Account deletion cancelled.');
        await query.refresh();
      } else {
        if (!scheduled && !query.data) {
          const result = await withRequestTimeout(() => scheduleAccountDeletion(connection));
          if (!active()) return;
          setScheduled(result.deleteAfter);
        }
        await signOut();
      }
    } catch {
      if (!active()) return;
      setIssue(
        cancel
          ? 'Could not cancel deletion. Retry when connected.'
          : 'Could not complete the request. Retry when connected; scheduling the same deletion is safe.',
      );
      await query.refresh();
    } finally {
      inFlight.current = false;
      if (active()) setBusy(false);
    }
  }
  const deletion = query.data;
  const waiting = offline.records.length;
  return (
    <Screen insetTop={false}>
      <ScreenHeading title="Delete your account" />
      <Notice message="Your account and uploaded photos will be deleted after 30 days. Signing in before deletion starts cancels it." />
      <Notice message="Shared nights retain anonymous records. Nights you host will be closed. Unfinished setups and messages on this device will be removed." />
      {query.loading ? <LoadingPanel /> : null}
      {query.issue ? (
        <RetryPanel issue={query.issue} retry={() => void query.refresh()} />
      ) : deletion || scheduled ? (
        <Panel>
          <Text style={typography.sectionTitle}>
            {deletion?.status === 'processing' ? 'Deletion in progress' : 'Deletion scheduled'}
          </Text>
          <Text style={typography.body}>
            {new Date(scheduled ?? deletion?.delete_after ?? '').toLocaleDateString([], {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </Text>
          {deletion?.status !== 'processing' ? (
            <PrimaryButton
              label="Cancel deletion"
              variant="secondary"
              busy={busy}
              onPress={() => void submit(true)}
            />
          ) : null}
          <PrimaryButton label="Sign out" busy={busy} onPress={() => void submit(false)} />
        </Panel>
      ) : (
        <>
          {offline.issue ? (
            <Notice
              error
              message="Could not read pending entries. Resolve device storage before scheduling deletion."
            />
          ) : waiting ? (
            <Panel>
              <Notice
                message={`${waiting} entries are waiting on this device. Sync or remove them before deleting your account.`}
              />
              <PrimaryButton
                label="Review pending entries"
                variant="secondary"
                onPress={() => router.replace('/')}
              />
            </Panel>
          ) : null}
          <SettingsRow
            label="I understand and want to delete my account"
            value={confirmed}
            disabled={busy}
            onChange={setConfirmed}
          />
          <PrimaryButton
            label="Schedule account deletion"
            variant="danger"
            busy={busy}
            disabled={!confirmed || waiting > 0 || Boolean(offline.issue) || query.loading}
            onPress={() => void submit(false)}
          />
        </>
      )}
      {issue ? <Notice error message={issue} /> : null}
      {notice ? <Notice message={notice} /> : null}
    </Screen>
  );
}
