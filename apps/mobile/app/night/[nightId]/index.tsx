import { useRef, useState } from 'react';
import { RefreshControl, ScrollView, Share, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  calculatePlanTotal,
  determinePlanStatus,
  canUserDeleteLog,
  canUserLogForMember,
  canUserEndOrExtendNight,
  canUserLeaveNight,
  bottlePlanProgress,
} from '@dwd/core';
import {
  createNightInvite,
  endNight,
  extendNight,
  leaveNight,
  softDeleteActivity,
  visibleAlerts,
} from '@dwd/data';
import { Choice } from '@/components/choice';
import { NightMetrics } from '@/components/night-metrics';
import { NightPeople } from '@/components/night-people';
import { NightCheckIns } from '@/components/night-check-ins';
import { NightActivity } from '@/components/night-activity';
import { PrimaryButton } from '@/components/primary-button';
import {
  LoadingPanel,
  Notice,
  Panel,
  RetryPanel,
  Screen,
  ScreenHeading,
} from '@/components/screen';
import { useNight } from '@/hooks/use-night';
import { useLogging } from '@/hooks/use-logging';
import { confirmAction } from '@/lib/confirm';
import { hashInvite, newInviteToken } from '@/lib/invites';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme } from '@/providers/theme-provider';
import { availableBottles, nightAccess } from '@/lib/night-features';
import { PendingLogs } from '@/components/pending-logs';

export default function NightScreen() {
  const { nightId, memberId } = useLocalSearchParams<{ nightId: string; memberId?: string }>();
  const router = useRouter();
  const { client, status } = useSupabase();
  const { colors, typography } = useTheme();
  const { snapshot, issue, refresh, connected, now, loading, cached } = useNight(nightId);
  const logging = useLogging(() => {
    void refresh();
  }, snapshot);
  const [selection, setSelection] = useState<{
    destination: string | undefined;
    memberId: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);
  const invite = useRef<{ token: string; expiresAt: string } | null>(null);
  const actor = snapshot?.members.find((m) => m.id === snapshot.currentMemberId) ?? null;
  const manageable =
    snapshot?.members.filter((target) =>
      canUserLogForMember({
        actorUserId: snapshot.currentUserId,
        actorMembership: actor,
        targetMember: target,
        night: snapshot.night,
      }),
    ) ?? [];
  const selected = selection?.destination === memberId ? selection?.memberId : memberId;
  const member = manageable.find((m) => m.id === selected) ?? actor;
  const allowed =
    member &&
    snapshot &&
    canUserLogForMember({
      actorUserId: snapshot.currentUserId,
      actorMembership: actor,
      targetMember: member,
      night: snapshot.night,
    });
  const drinks = member?.drinkLogs.filter((log) => !log.deletedAt) ?? [];
  const water = member?.waterLogs.filter((log) => !log.deletedAt) ?? [];
  const quick = member?.planItems.find((p) => p.isQuickLog && !p.archivedAt);
  const mainBottle = snapshot?.sharedBottles?.find((b) => b.id === quick?.sharedBottleId);
  const planned = calculatePlanTotal(member?.planItems.filter((p) => !p.archivedAt) ?? []);
  const planStatus = determinePlanStatus(
    drinks.reduce((sum, log) => sum + log.ethanolGrams, 0),
    planned,
  );
  const host = snapshot && canUserEndOrExtendNight(snapshot.currentUserId, snapshot.night);
  async function mutate(action: () => Promise<unknown>, success: string) {
    if (inFlight.current || logging.busy) return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage(success);
      await refresh();
    } catch {
      setMessage('Could not save the change. Refresh and try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function finish() {
    if (
      !client ||
      !(await confirmAction(
        'End this night?',
        'Everyone will move to the night recap.',
        'End night',
        true,
      ))
    )
      return;
    await mutate(async () => {
      await endNight(client, nightId);
      router.replace(`/night/${nightId}/summary`);
    }, 'Night ended.');
  }
  async function shareInvite() {
    if (!client) return;
    await mutate(async () => {
      invite.current ??= {
        token: await newInviteToken(),
        expiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
      };
      await createNightInvite(client, {
        nightId,
        tokenHash: await hashInvite(invite.current.token),
        expiresAt: invite.current.expiresAt,
        maxUses: null,
      });
      await Share.share({
        message: `Join ${snapshot?.night.title ?? 'my night'} on DWD. Invite code: ${invite.current.token}`,
      });
    }, '');
  }
  return (
    <Screen
      insetTop={false}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => void refresh()}
          tintColor={colors.primary}
        />
      }
    >
      <Stack.Screen
        options={{ title: snapshot?.night.status === 'ended' ? 'Night ended' : 'Tonight' }}
      />
      <PendingLogs
        key={`${nightId}:${snapshot?.currentUserId}`}
        nightId={nightId}
        snapshot={snapshot}
      />
      {status !== 'signed-in' ? (
        <Panel>
          <Notice message="Sign in to open this night." />
          <PrimaryButton label="Sign in" onPress={() => router.replace('/account')} />
        </Panel>
      ) : issue && !snapshot ? (
        <RetryPanel issue={issue} retry={() => void refresh()} />
      ) : !snapshot ? (
        <LoadingPanel />
      ) : (
        <>
          <ScreenHeading title={snapshot.night.title} />
          <PrimaryButton
            label="Get help"
            icon="medical-outline"
            variant="danger"
            onPress={() => router.push(`/night/${nightId}/help`)}
          />
          <Text style={typography.body}>
            {snapshot.night.status === 'ended'
              ? 'Ended'
              : `Planned end · ${new Date(snapshot.night.endsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: snapshot.night.timezone })}`}
          </Text>
          {issue ? (
            cached ? (
              <Notice message={issue} />
            ) : (
              <RetryPanel issue={issue} retry={() => void refresh()} />
            )
          ) : !connected && snapshot.night.status === 'active' ? (
            <Notice message="Reconnecting to live updates" />
          ) : null}
          {snapshot.night.status === 'ended' ? (
            <PrimaryButton
              label="View recap"
              onPress={() => router.replace(`/night/${nightId}/summary`)}
            />
          ) : (
            <>
              {manageable.length > 1 ? (
                <View style={{ gap: 8 }}>
                  <Text accessibilityRole="header" style={typography.sectionTitle}>
                    Logging for
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, padding: 4 }}
                  >
                    {manageable.map((m) => (
                      <View key={m.id} style={{ minWidth: 120, maxWidth: 220 }}>
                        <Choice
                          compact
                          label={m.displayName}
                          selected={m.id === member?.id}
                          disabled={busy || logging.busy}
                          onPress={() => setSelection({ destination: memberId, memberId: m.id })}
                        />
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ) : null}
              {member ? (
                <Panel style={{ padding: 18, gap: 18 }}>
                  <Text accessibilityRole="header" style={typography.sectionTitle}>
                    {member.id === actor?.id ? 'Your evening' : member.displayName}
                  </Text>
                  <NightMetrics drinks={drinks.length} water={water.length} />
                  <Text style={typography.body}>
                    {member.planSetupCompletedAt === null
                      ? 'Choose a plan to start'
                      : planned === 0
                        ? 'Chaser-only plan'
                        : planStatus === 'within_plan'
                          ? 'Within your plan'
                          : planStatus === 'reached'
                            ? 'Plan reached'
                            : 'Beyond your plan'}
                  </Text>
                  {nightAccess(snapshot, member.id).canEdit ? (
                    <PrimaryButton
                      label={member.planSetupCompletedAt === null ? 'Set your plan' : 'Edit plan'}
                      variant="quiet"
                      disabled={busy || logging.busy}
                      onPress={() =>
                        router.push({
                          pathname: `/night/${nightId}/plan`,
                          params: { memberId: member.id },
                        })
                      }
                    />
                  ) : null}
                  {mainBottle && quick ? (
                    <View style={{ gap: 8 }}>
                      <Text style={typography.body}>
                        {mainBottle.remainingMl} ml left in {mainBottle.label}
                      </Text>
                      <Text style={typography.body}>
                        {bottlePlanProgress(mainBottle.id, drinks, quick.volumeMl)} drinks logged ·{' '}
                        {quick.plannedQuantity} planned
                      </Text>
                      {mainBottle.closedAt ? (
                        <Notice message="This bottle has been put away. Choose another main drink." />
                      ) : mainBottle.remainingMl < quick.volumeMl ? (
                        <Notice message="Less than one drink remains. Adjust the size in Shared bottles." />
                      ) : null}
                    </View>
                  ) : null}
                  {allowed ? (
                    <>
                      {quick ? (
                        <View style={{ gap: 10 }}>
                          <Text
                            style={{
                              color: colors.muted,
                              fontSize: 13,
                              fontWeight: '500',
                              textAlign: 'center',
                            }}
                          >
                            {quick.label} · {quick.volumeMl} ml · {quick.abvPercent}%
                          </Text>
                          <PrimaryButton
                            label={`Log ${quick.label.toLowerCase()}`}
                            icon="add-circle-outline"
                            busy={logging.busy}
                            disabled={
                              busy ||
                              Boolean(
                                mainBottle &&
                                (mainBottle.closedAt || mainBottle.remainingMl < quick.volumeMl),
                              )
                            }
                            onPress={() => void logging.log(member.id, { planItemId: quick.id })}
                          />
                        </View>
                      ) : null}
                      <PrimaryButton
                        label={quick ? 'Log another drink' : 'Log a drink'}
                        variant={quick ? 'secondary' : 'primary'}
                        disabled={busy || logging.busy || member.planSetupCompletedAt === null}
                        onPress={() =>
                          router.push({
                            pathname: `/night/${nightId}/log`,
                            params: { memberId: member.id },
                          })
                        }
                      />
                      <PrimaryButton
                        label="Log chaser"
                        icon="water-outline"
                        variant="water"
                        disabled={busy}
                        busy={logging.busy}
                        onPress={() => void logging.log(member.id, 'water')}
                      />
                      {logging.issue || logging.notice ? (
                        <Notice
                          message={logging.issue || logging.notice || ''}
                          error={Boolean(logging.issue)}
                        />
                      ) : null}
                    </>
                  ) : null}
                </Panel>
              ) : null}
              {member && allowed ? (
                <PrimaryButton
                  label="Shared bottles"
                  icon="wine-outline"
                  variant="secondary"
                  disabled={busy || logging.busy}
                  onPress={() =>
                    router.push({
                      pathname: `/night/${nightId}/bottles`,
                      params: { memberId: member.id },
                    })
                  }
                />
              ) : null}
              {member &&
              allowed &&
              availableBottles(snapshot, member.id).some(
                (b) => !b.closedAt && b.remainingMl > 0 && !b.joinedMemberIds.includes(member.id),
              ) ? (
                <Notice message="A shared bottle is available. Open Shared bottles to choose whether to join." />
              ) : null}
              <NightCheckIns
                key={`${snapshot.currentUserId}:${nightId}`}
                snapshot={snapshot}
                now={now}
              />
              <PrimaryButton
                label="Reminders"
                icon="notifications-outline"
                variant="quiet"
                onPress={() => router.push(`/night/${nightId}/reminders`)}
              />
              {Date.parse(snapshot.night.endsAt) <= now ? (
                <Notice message="The planned end time has passed." />
              ) : null}
              {visibleAlerts(snapshot)
                .filter((alert) => !alert.expiresAt || Date.parse(alert.expiresAt) > now)
                .map((alert) => (
                  <Panel key={alert.id}>
                    <Notice message={alert.message} />
                  </Panel>
                ))}
            </>
          )}
          {member ? (
            <NightActivity
              member={member}
              timezone={snapshot.night.timezone}
              now={now}
              busy={busy || logging.busy}
              canUndo={(logActorId) =>
                snapshot.night.status === 'active' &&
                canUserDeleteLog(
                  {
                    actorUserId: snapshot.currentUserId,
                    actorMembership: actor,
                    targetMember: member,
                    night: snapshot.night,
                  },
                  logActorId,
                )
              }
              onUndo={(id, kind) => {
                if (client)
                  void mutate(() => softDeleteActivity(client, id, kind), 'Entry removed.');
              }}
            />
          ) : null}
          <NightPeople
            key={`${snapshot.currentUserId}:${nightId}`}
            snapshot={snapshot}
            busy={busy || logging.busy}
            refresh={refresh}
          />
          {message ? <Notice message={message} /> : null}
          {host ? (
            <Panel>
              <Text accessibilityRole="header" style={typography.sectionTitle}>
                Host controls
              </Text>
              <PrimaryButton
                label="Share invite code"
                icon="share-outline"
                variant="secondary"
                busy={busy}
                disabled={logging.busy}
                onPress={() => void shareInvite()}
              />
              <PrimaryButton
                label="Extend by 30 minutes"
                icon="time-outline"
                variant="secondary"
                busy={busy}
                disabled={logging.busy}
                onPress={() => {
                  if (client)
                    void mutate(() => extendNight(client, nightId, 30), 'End time extended.');
                }}
              />
              <PrimaryButton
                label="End night"
                variant="danger"
                disabled={busy || logging.busy}
                onPress={() => void finish()}
              />
            </Panel>
          ) : actor && canUserLeaveNight(snapshot.currentUserId, snapshot.night, actor) ? (
            <PrimaryButton
              label="Leave night"
              variant="secondary"
              disabled={busy || logging.busy}
              onPress={() =>
                void (async () => {
                  if (
                    client &&
                    (await confirmAction(
                      'Leave this night?',
                      'You can rejoin with an active invite.',
                      'Leave night',
                    ))
                  ) {
                    await mutate(async () => {
                      await leaveNight(client, nightId);
                      router.replace('/');
                    }, '');
                  }
                })()
              }
            />
          ) : null}
          <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>
            DWD cannot determine sobriety or driving safety.
          </Text>
        </>
      )}
    </Screen>
  );
}
