import { useRef, useState } from 'react';
import { RefreshControl, Share, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  calculatePlanTotal,
  determinePlanStatus,
  canUserDeleteLog,
  canUserLogForMember,
  canUserEndOrExtendNight,
  canUserLeaveNight,
} from '@dwd/core';
import {
  createNightInvite,
  endNight,
  extendNight,
  leaveNight,
  softDeleteActivity,
} from '@dwd/data';
import { Choice } from '@/components/choice';
import { NightMetrics } from '@/components/night-metrics';
import { Ionicons } from '@expo/vector-icons';
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

export default function NightScreen() {
  const { nightId } = useLocalSearchParams<{ nightId: string }>();
  const router = useRouter();
  const { client, status } = useSupabase();
  const { colors, typography } = useTheme();
  const { snapshot, issue, refresh, connected, now, loading } = useNight(nightId);
  const logging = useLogging(() => {
    void refresh();
  });
  const [selected, setSelected] = useState<string | null>(null);
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
          <Text style={typography.body}>
            {snapshot.night.status === 'ended'
              ? 'Ended'
              : `Planned end · ${new Date(snapshot.night.endsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: snapshot.night.timezone })}`}
          </Text>
          {issue ? (
            <RetryPanel issue={issue} retry={() => void refresh()} />
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
                  {manageable.map((m) => (
                    <Choice
                      key={m.id}
                      label={m.displayName}
                      selected={m.id === member?.id}
                      disabled={busy || logging.busy}
                      onPress={() => setSelected(m.id)}
                    />
                  ))}
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
                  {member.id === actor?.id ? (
                    <PrimaryButton
                      label={member.planSetupCompletedAt === null ? 'Set your plan' : 'Edit plan'}
                      variant="quiet"
                      disabled={busy || logging.busy}
                      onPress={() => router.push(`/night/${nightId}/plan`)}
                    />
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
                            disabled={busy}
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
              {Date.parse(snapshot.night.endsAt) <= now ? (
                <Notice message="The planned end time has passed." />
              ) : null}
              {snapshot.alerts
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
          <Panel>
            <Text accessibilityRole="header" style={typography.sectionTitle}>
              People
            </Text>
            {snapshot.members
              .filter((m) => m.leftAt === null)
              .map((m) => (
                <View
                  key={m.id}
                  style={{
                    gap: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 6,
                  }}
                >
                  <View
                    accessible={false}
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 21,
                      backgroundColor: colors.primarySoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: colors.primary, fontSize: 17, fontWeight: '600' }}>
                      {m.displayName.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
                      {m.displayName}
                      {m.role === 'host' ? ' · Host' : ''}
                    </Text>
                    <Text style={typography.body}>
                      {m.drinkLogs.filter((log) => !log.deletedAt).length} drinks ·{' '}
                      {m.waterLogs.filter((log) => !log.deletedAt).length} chasers
                    </Text>
                  </View>
                  {m.role === 'host' ? (
                    <Ionicons
                      name="star-outline"
                      size={18}
                      color={colors.primary}
                      accessible={false}
                    />
                  ) : null}
                </View>
              ))}
          </Panel>
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
