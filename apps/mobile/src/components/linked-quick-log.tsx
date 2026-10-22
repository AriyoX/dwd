import { Alert, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  canUserEndOrExtendNight,
  quickCounts,
  quickLinkedMember,
  quickLinkedNight,
  quickMainDrink,
  quickTotalsLabel,
  availableQuickEntries,
  type QuickSession,
} from '@dwd/core';
import { endNight, softDeleteActivity } from '@dwd/data';
import { useNight } from '@/hooks/use-night';
import { useLogging } from '@/hooks/use-logging';
import { useNightAction } from '@/hooks/use-night-action';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme } from '@/providers/theme-provider';
import { useOffline } from '@/providers/offline-provider';
import { useConnectivity } from '@/providers/connectivity-provider';
import { actorClient } from '@/lib/actor-client';
import { pendingForSnapshot } from '@/lib/offline-logging';
import { Screen, Panel, Notice } from './screen';
import { Action, PrimaryButton } from './primary-button';
import { useQuickLogAds } from './quick-log-ads';
import { NightActivity } from './night-activity';
import { QuickNightActivity } from './quick-night-activity';
import { QuickLogControls } from './quick-log-controls';

export function LinkedQuickLog({
  quick,
  writable,
  onFinish,
  onStart,
  issue,
}: {
  quick: QuickSession;
  writable: boolean;
  onFinish: () => void;
  onStart: () => void;
  issue: string | null;
}) {
  const ads = useQuickLogAds();
  const destination = quickLinkedNight(quick);
  if (!destination) throw new Error('This session has no linked night.');
  const link = destination;
  const { client, session } = useSupabase();
  const { snapshot, refresh, now, issue: loadIssue } = useNight(link.nightId);
  const { colors, typography } = useTheme();
  const { records, outbox } = useOffline();
  const { online } = useConnectivity();
  const router = useRouter();
  const logging = useLogging((remote) => {
    if (remote) void refresh();
  }, snapshot);
  const action = useNightAction(refresh);
  const member = snapshot && session ? quickLinkedMember(snapshot, link, session.user.id) : null;
  const main = member ? quickMainDrink(member) : undefined;
  const active = snapshot?.night.status === 'active' && Boolean(member);
  const finished = quick.state === 'finished';
  const disabled = !writable || !active || finished || logging.busy || action.busy;
  const pending = snapshot
    ? pendingForSnapshot(snapshot, records).filter((entry) => entry.nightMemberId === member?.id)
    : [];
  const counted = pending.filter(
    (entry) => !['permanent_failure', 'needs_confirmation'].includes(entry.status),
  );
  const earlier = quickCounts(member?.quickLogs ?? []);
  function finish() {
    const host = snapshot && canUserEndOrExtendNight(snapshot.currentUserId, snapshot.night);
    const waiting = records.some((entry) => entry.nightId === link.nightId);
    const canEnd = host && active && online !== false && !waiting;
    Alert.alert(
      host && active ? 'End the night too?' : 'Finish Quick Log?',
      host && active
        ? waiting
          ? 'Some entries still need saving. Review Entries before ending the night.'
          : 'Ending the night ends it for everyone.'
        : 'Your entries stay saved. The night stays open for everyone.',
      [
        { text: 'Keep logging', style: 'cancel' },
        { text: 'Quick Log only', onPress: onFinish },
        ...(canEnd
          ? [
              {
                text: 'End night too',
                style: 'destructive' as const,
                onPress: () => {
                  if (client && session)
                    void action.run(
                      () => endNight(actorClient(client, session.access_token), link.nightId),
                      undefined,
                      onFinish,
                    );
                },
              },
            ]
          : []),
      ],
    );
  }
  async function undo() {
    if (!member || !client || !session || disabled) return;
    const latest = [
      ...member.drinkLogs
        .filter((entry) => !entry.deletedAt)
        .map((entry) => ({ ...entry, kind: 'alcohol' as const })),
      ...member.waterLogs
        .filter((entry) => !entry.deletedAt)
        .map((entry) => ({ ...entry, kind: 'water' as const })),
    ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
    const local = [...pending].sort(
      (a, b) => Date.parse(b.createdLocallyAt) - Date.parse(a.createdLocallyAt),
    )[0];
    if (local && (!latest || Date.parse(local.createdLocallyAt) >= Date.parse(latest.createdAt))) {
      if (outbox) await action.run(() => outbox.remove(local.idempotencyKey), 'Entry removed.');
    } else if (latest)
      await action.run(
        () => softDeleteActivity(actorClient(client, session.access_token), latest.id, latest.kind),
        'Entry removed.',
      );
  }
  return (
    <Screen hidePermissionReminder contentStyle={{ gap: 16 }} footer={ads} floatingFooter>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ ...typography.sectionTitle, flex: 1 }}>Quick Log</Text>
        <Action
          label="Quick Log history"
          onPress={() =>
            router.push({
              pathname: '/quick-history',
              params: { scope: quick.scope === 'guest' ? 'guest' : 'account' },
            })
          }
          style={{ alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="time-outline" size={24} color={colors.primary} />
        </Action>
        <PrimaryButton label="Home" variant="quiet" onPress={() => router.dismissTo('/')} />
      </View>
      {!snapshot || !member ? (
        <Panel>
          <Notice
            message={
              !session
                ? 'Sign in to keep logging with your night.'
                : loadIssue || snapshot
                  ? 'Could not open your night. Your entries are still saved.'
                  : 'Opening your night…'
            }
          />
          <PrimaryButton
            label={session ? 'Try again' : 'Sign in'}
            onPress={() => (session ? void refresh() : router.push('/auth/sign-in'))}
          />
          <PrimaryButton
            label="Finish Quick Log only"
            variant="quiet"
            disabled={!writable}
            onPress={onFinish}
          />
        </Panel>
      ) : (
        <>
          <Action
            label={`Open ${snapshot.night.title}`}
            onPress={() => router.dismissTo(`/night/${link.nightId}`)}
            style={{
              padding: 16,
              borderRadius: 22,
              backgroundColor: colors.surface,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <Ionicons name="moon-outline" size={22} color={colors.primary} />
            <Text style={{ ...typography.sectionTitle, flex: 1 }}>{snapshot.night.title}</Text>
            <Text style={typography.body}>{active ? 'Linked' : 'Ended'}</Text>
          </Action>
          <Panel style={{ alignItems: 'center', gap: 6 }}>
            <Text style={{ ...typography.sectionTitle, fontVariant: ['tabular-nums'] }}>
              {quickTotalsLabel(
                member.drinkLogs.filter((entry) => !entry.deletedAt).length +
                  earlier.drink +
                  counted.filter((entry) => entry.kind === 'alcohol').length,
                member.waterLogs.filter((entry) => !entry.deletedAt).length +
                  earlier.chaser +
                  counted.filter((entry) => entry.kind === 'water').length,
              )}
            </Text>
            <Text style={typography.body}>
              {finished ? 'Quick Log finished' : 'Your total for this night'}
            </Text>
          </Panel>
          <QuickLogControls
            mainDrink={main}
            label={main ? `Log ${main.label}` : 'Choose a drink'}
            {...(main ? { detail: `${main.volumeMl} ml · ${main.abvPercent}%` } : {})}
            disabled={disabled}
            busy={logging.busy}
            onLog={() =>
              main
                ? void logging.log(member.id, { planItemId: main.id })
                : router.push(`/night/${link.nightId}/plan`)
            }
            onChaser={() => void logging.log(member.id, 'water')}
            onUndo={() => void undo()}
            onChoose={() =>
              router.push(
                `/night/${link.nightId}/${member.planSetupCompletedAt === null ? 'plan' : 'log'}`,
              )
            }
          />
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }}
          >
            <PrimaryButton
              label="Edit plan"
              variant="quiet"
              disabled={disabled}
              onPress={() => router.push(`/night/${link.nightId}/plan`)}
            />
            <PrimaryButton
              label="Shared bottles"
              variant="secondary"
              disabled={disabled}
              onPress={() => router.push(`/night/${link.nightId}/bottles`)}
            />
          </View>
          {availableQuickEntries(quick).length ? (
            <PrimaryButton
              label={`Add remaining earlier entries (${availableQuickEntries(quick).length})`}
              variant="secondary"
              onPress={() =>
                router.replace({
                  pathname: '/quick-transfer',
                  params: {
                    scope: quick.scope === 'guest' ? 'guest' : 'account',
                    sessionId: quick.id,
                    nightId: link.nightId,
                  },
                })
              }
            />
          ) : null}
          <NightActivity
            snapshot={snapshot}
            member={member}
            nightId={link.nightId}
            timezone={snapshot.night.timezone}
            now={now}
            busy={disabled}
            canUndo={(actorId) => active && actorId === session?.user.id}
            onUndo={(id, kind) => {
              if (client && session)
                void action.run(
                  () => softDeleteActivity(actorClient(client, session.access_token), id, kind),
                  'Entry removed.',
                );
            }}
          />
          <QuickNightActivity member={member} refresh={refresh} />
          <PrimaryButton
            label="View night"
            variant="secondary"
            onPress={() => router.dismissTo(`/night/${link.nightId}`)}
          />
          {!finished ? (
            <PrimaryButton
              label="Finish session"
              variant="quiet"
              disabled={!writable || logging.busy || action.busy}
              onPress={finish}
            />
          ) : null}
        </>
      )}
      {finished ? (
        <PrimaryButton label="Start another session" disabled={!writable} onPress={onStart} />
      ) : null}
      {issue || logging.issue || action.issue ? (
        <Notice error message={issue ?? logging.issue ?? action.issue ?? ''} />
      ) : null}
      {logging.notice || action.notice ? (
        <Notice message={logging.notice ?? action.notice ?? ''} />
      ) : null}
    </Screen>
  );
}
