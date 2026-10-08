import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import {
  cancelAccountDeletion,
  getAccountDeletion,
  getAppleDeletionReady,
  scheduleAccountDeletion,
} from '@dwd/data';
import { AppleButton } from '@/components/apple-button';
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
import { clearAccountPhotoFiles } from '@/lib/photo-files';
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
  const query = useAccountQuery(getAccountDeletion, '', false, true);
  const apple = useAccountQuery(getAppleDeletionReady, 'apple-deletion', false, true);
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
    // This account's confirmed deletion includes unfinished local photo copies.
    clearAccountPhotoFiles(session.user.id);
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
        'Deletion is scheduled in 30 days. Signing in before deletion starts cancels it. Your plans, drink and water entries, and photos will be removed.',
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
          ? "Couldn't cancel deletion. Try again when you're online."
          : "Couldn't schedule deletion. Try again when you're online.",
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
      <Notice message="Your plans, drink and water entries, and photos will be removed. Other participants keep their own records and a minimal anonymous membership timeline. Nights you host will be closed. Unsaved entries and drafts on this device will be discarded." />
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
          {apple.data === false ? (
            <Panel>
              <Notice message="Reconnect the Apple account linked to DWD so its access can be revoked when your account is deleted." />
              <AppleButton
                disabled={busy}
                busy={busy}
                onSignIn={(authenticate) => {
                  if (inFlight.current) return;
                  inFlight.current = true;
                  setBusy(true);
                  setIssue(null);
                  void authenticate()
                    .then(
                      () => {
                        if (active()) void apple.refresh();
                      },
                      () => {
                        if (active())
                          setIssue("Couldn't sign in with Apple. Try again when you're online.");
                      },
                    )
                    .finally(() => {
                      inFlight.current = false;
                      if (active()) setBusy(false);
                    });
                }}
              />
            </Panel>
          ) : null}
          {apple.issue ? (
            <RetryPanel issue={apple.issue} retry={() => void apple.refresh()} />
          ) : null}
          {offline.issue ? (
            <Notice
              error
              message="Pending entries could not be read. Deleting your account will also discard unsaved entries on this device."
            />
          ) : waiting ? (
            <Panel>
              <Notice
                message={`${waiting} unsaved entries will be discarded when you delete your account. You can review them first.`}
              />
              <PrimaryButton
                label="View entries"
                variant="secondary"
                onPress={() => router.replace('/history')}
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
            disabled={!confirmed || query.loading || apple.loading || apple.data !== true}
            onPress={() => void submit(false)}
          />
        </>
      )}
      {issue ? <Notice error message={issue} /> : null}
      {notice ? <Notice dismissible message={notice} /> : null}
    </Screen>
  );
}
