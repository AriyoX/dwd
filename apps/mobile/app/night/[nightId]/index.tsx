import { useCallback, useEffect, useRef, useState } from 'react';
import { invalidateAccountQuery } from '@/lib/account-query-state';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  calculatePlanTotal,
  determinePlanStatus,
  canUserDeleteLog,
  canUserLogForMember,
  canUserEndOrExtendNight,
  canUserLeaveNight,
  bottlePlanProgress,
  calculateEthanolGrams,
} from '@dwd/core';
import { endNight, extendNight, leaveNight, softDeleteActivity, visibleAlerts } from '@dwd/data';
import { Choice } from '@/components/choice';
import { NavigationRow } from '@/components/navigation-row';
import { NightMetrics } from '@/components/night-metrics';
import { NightPeople } from '@/components/night-people';
import { NightCheckIns } from '@/components/night-check-ins';
import { NightActivity } from '@/components/night-activity';
import { Disclosure } from '@/components/disclosure';
import { Action, PrimaryButton } from '@/components/primary-button';
import { DrinkLogButton } from '@/components/drink-log-button';
import { LoadingPanel, Notice, Panel, RetryPanel, Screen } from '@/components/screen';
import { useNight } from '@/hooks/use-night';
import { useLogging } from '@/hooks/use-logging';
import { confirmAction } from '@/lib/confirm';
import { plannedEndKey } from '@/lib/catch-up';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme } from '@/providers/theme-provider';
import { availableBottles, nightAccess } from '@/lib/night-features';
import { useOffline } from '@/providers/offline-provider';
import { useConnectivity } from '@/providers/connectivity-provider';
import { pendingForSnapshot } from '@/lib/offline-logging';
import { ensureNightInvite } from '@/lib/automatic-invite';
import { actorClient } from '@/lib/actor-client';

export default function NightScreen() {
  const { nightId, memberId } = useLocalSearchParams<{ nightId: string; memberId?: string }>();
  const router = useRouter();
  const { client, session, status } = useSupabase();
  const { colors, typography } = useTheme();
  const { records } = useOffline();
  const { online } = useConnectivity();
  const { snapshot, issue, refresh, now, refreshing, cached } = useNight(nightId);
  const logging = useLogging((remote) => {
    if (remote) void refresh();
  }, snapshot);
  const [selection, setSelection] = useState<{
    destination: string | undefined;
    memberId: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);
  const dismissedEnd = useRef<string | null>(null);
  const endAt = snapshot?.night.endsAt;
  const owner = snapshot?.currentUserId;
  const nightStatus = snapshot?.night.status;
  useFocusEffect(
    useCallback(() => {
      if (!endAt || !owner || nightStatus !== 'active' || Date.parse(endAt) > now) return;
      const key = plannedEndKey(owner, nightId);
      let dismissed = dismissedEnd.current === `${owner}:${endAt}`;
      try {
        dismissed ||= globalThis.localStorage.getItem(key) === endAt;
      } catch {
        /* Retain an in-memory dismissal. */
      }
      if (!dismissed) {
        dismissedEnd.current = `${owner}:${endAt}`;
        try {
          globalThis.localStorage.setItem(key, endAt);
        } catch {
          /* The in-memory dismissal still prevents a loop. */
        }
        router.push(`/night/${nightId}/planned-end`);
      }
    }, [endAt, owner, nightStatus, nightId, now, router]),
  );
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
  const pending = snapshot
    ? pendingForSnapshot(snapshot, records).filter(
        (record) =>
          record.nightMemberId === member?.id &&
          record.status !== 'permanent_failure' &&
          record.status !== 'needs_confirmation',
      )
    : [];
  const quick = member?.planItems.find((p) => p.isQuickLog && !p.archivedAt);
  const mainBottle = snapshot?.sharedBottles?.find((b) => b.id === quick?.sharedBottleId);
  const planned = calculatePlanTotal(member?.planItems.filter((p) => !p.archivedAt) ?? []);
  const planStatus = determinePlanStatus(
    drinks.reduce((sum, log) => sum + log.ethanolGrams, 0) +
      pending.reduce(
        (sum, record) =>
          sum +
          (record.drinkSnapshot
            ? calculateEthanolGrams(record.drinkSnapshot.volumeMl, record.drinkSnapshot.abvPercent)
            : 0),
        0,
      ),
    planned,
  );
  const host = snapshot && canUserEndOrExtendNight(snapshot.currentUserId, snapshot.night);
  useEffect(() => {
    // Resume an unfinished invitation after a restart or reconnection. An
    // explicit revocation remains off, and an existing token is reused.
    if (
      !host ||
      nightStatus !== 'active' ||
      online === false ||
      !client ||
      !session ||
      owner !== session.user.id
    )
      return;
    void ensureNightInvite(
      globalThis.localStorage,
      actorClient(client, session.access_token),
      session.user.id,
      nightId,
    ).catch(() => undefined);
  }, [host, nightStatus, online, client, session, owner, nightId]);
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
      !snapshot ||
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
      invalidateAccountQuery(snapshot.currentUserId, 'finished-nights');
      router.replace(`/night/${nightId}/summary`);
    }, 'Night ended.');
  }
  const activity =
    snapshot && member ? (
      <NightActivity
        key={`${nightId}:${member.id}`}
        snapshot={snapshot}
        nightId={nightId}
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
          if (client) void mutate(() => softDeleteActivity(client, id, kind), 'Entry removed.');
        }}
      />
    ) : null;
  return (
    <Screen
      insetTop={false}
      footer={
        snapshot?.night.status === 'active' &&
        member &&
        allowed &&
        member.planSetupCompletedAt !== null ? (
          <View style={{ gap: 8 }}>
            {logging.issue || logging.notice ? (
              <Notice
                dismissible
                message={logging.issue || logging.notice || ''}
                error={Boolean(logging.issue)}
              />
            ) : null}
            {mainBottle &&
            quick &&
            (mainBottle.closedAt || mainBottle.remainingMl < quick.volumeMl) ? (
              <>
                <Text style={typography.body}>
                  {mainBottle.closedAt
                    ? 'Bottle put away'
                    : `${mainBottle.remainingMl} ml left in ${mainBottle.label}`}
                </Text>
                <PrimaryButton
                  large
                  label="Choose a drink"
                  disabled={busy || logging.busy}
                  onPress={() =>
                    router.push({
                      pathname: `/night/${nightId}/bottles`,
                      params: { memberId: member.id },
                    })
                  }
                />
              </>
            ) : quick ? (
              <DrinkLogButton
                primary
                label={quick.label}
                detail={`${member.id !== actor?.id ? `${member.displayName} · ` : ''}${quick.volumeMl} ml · ${quick.abvPercent}%${mainBottle ? ' · shared bottle' : ''}`}
                busy={logging.busy}
                disabled={busy}
                onPress={() => void logging.log(member.id, { planItemId: quick.id })}
              />
            ) : (
              <PrimaryButton
                large
                label="Log drink"
                disabled={busy || logging.busy}
                onPress={() =>
                  router.push({
                    pathname: `/night/${nightId}/log`,
                    params: { memberId: member.id },
                  })
                }
              />
            )}
          </View>
        ) : undefined
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh(true)}
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text accessibilityRole="header" style={typography.sectionTitle}>
                {snapshot.night.title}
              </Text>
              <Text style={typography.body}>
                {snapshot.night.status === 'ended'
                  ? 'Ended'
                  : `Until ${new Date(snapshot.night.endsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: snapshot.night.timezone })}`}
              </Text>
            </View>
            <Action
              label="Get help"
              onPress={() => router.push(`/night/${nightId}/help`)}
              style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 }}
            >
              <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>
                Get help
              </Text>
            </Action>
          </View>
          {issue ? (
            cached ? (
              <Notice message={issue} />
            ) : (
              <RetryPanel issue={issue} retry={() => void refresh()} />
            )
          ) : online === false && snapshot.night.status === 'active' ? (
            <Notice message="You're offline. We'll save your entries for later." />
          ) : null}
          {snapshot.night.status === 'active' && member ? (
            <>
              {manageable.length > 1 ? (
                <View style={{ gap: 8 }}>
                  <Text style={typography.body}>Logging for</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, padding: 4 }}
                  >
                    {manageable.map((person) => (
                      <View key={person.id} style={{ minWidth: 120, maxWidth: 220 }}>
                        <Choice
                          compact
                          label={person.id === actor?.id ? 'You' : person.displayName}
                          selected={person.id === member.id}
                          disabled={busy || logging.busy}
                          onPress={() =>
                            setSelection({ destination: memberId, memberId: person.id })
                          }
                        />
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ) : null}
              <Panel style={{ padding: 16, gap: 12 }}>
                <NightMetrics
                  compact
                  drinks={
                    drinks.length + pending.filter((record) => record.kind === 'alcohol').length
                  }
                  water={water.length + pending.filter((record) => record.kind === 'water').length}
                />
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
                {member.planSetupCompletedAt === null &&
                nightAccess(snapshot, member.id).canEdit ? (
                  <PrimaryButton
                    label="Set your plan"
                    onPress={() =>
                      router.push({
                        pathname: `/night/${nightId}/plan`,
                        params: { memberId: member.id },
                      })
                    }
                  />
                ) : null}
                {allowed ? (
                  <>
                    <PrimaryButton
                      label="Log chaser"
                      icon="water-outline"
                      variant="water"
                      busy={logging.busy}
                      disabled={busy}
                      onPress={() => void logging.log(member.id, 'water')}
                    />
                    <PrimaryButton
                      label="Log another drink"
                      variant="secondary"
                      disabled={busy || logging.busy || member.planSetupCompletedAt === null}
                      onPress={() =>
                        router.push({
                          pathname: `/night/${nightId}/log`,
                          params: { memberId: member.id },
                        })
                      }
                    />
                  </>
                ) : null}
              </Panel>
              {allowed ? (
                <View style={{ gap: 12 }}>
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
                  {availableBottles(snapshot, member.id)
                    .filter(
                      (bottle) =>
                        !bottle.closedAt &&
                        bottle.remainingMl > 0 &&
                        !member.planItems.some(
                          (item) => !item.archivedAt && item.sharedBottleId === bottle.id,
                        ),
                    )
                    .map((bottle) => (
                      <Panel key={bottle.id} style={{ padding: 14, gap: 4 }}>
                        <Text style={typography.body}>On the table</Text>
                        <NavigationRow
                          label={`Join ${bottle.label}`}
                          icon="wine-outline"
                          detail={`${bottle.pourMl} ml per drink · ${bottle.remainingMl} ml left`}
                          disabled={busy || logging.busy}
                          onPress={() =>
                            router.push({
                              pathname: `/night/${nightId}/bottles`,
                              params: { memberId: member.id, bottleId: bottle.id },
                            })
                          }
                        />
                      </Panel>
                    ))}
                </View>
              ) : null}
            </>
          ) : null}
          {activity}
          {snapshot.night.status === 'ended' ? (
            <PrimaryButton
              label="View recap"
              onPress={() => router.replace(`/night/${nightId}/summary`)}
            />
          ) : (
            <>
              <NightCheckIns
                key={`${snapshot.currentUserId}:${nightId}`}
                snapshot={snapshot}
                now={now}
              />
              {visibleAlerts(snapshot)
                .filter((alert) => !alert.expiresAt || Date.parse(alert.expiresAt) > now)
                .map((alert) => (
                  <Notice key={alert.id} dismissible message={alert.message} />
                ))}
              {member ? (
                <Disclosure key={`options:${member.id}`} title="Night options">
                  {nightAccess(snapshot, member.id).canEdit ? (
                    <NavigationRow
                      label="Edit plan"
                      icon="create-outline"
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
                    <Text style={typography.body}>
                      {bottlePlanProgress(mainBottle.id, drinks, quick.volumeMl)} drinks from{' '}
                      {mainBottle.label} · {quick.plannedQuantity} planned
                    </Text>
                  ) : null}
                  {allowed ? (
                    <NavigationRow
                      label="Add missed entries"
                      icon="time-outline"
                      disabled={busy || logging.busy}
                      onPress={() =>
                        router.push({
                          pathname: `/night/${nightId}/catch-up`,
                          params: { memberId: member.id },
                        })
                      }
                    />
                  ) : null}
                  <NavigationRow
                    label="Reminders"
                    icon="notifications-outline"
                    onPress={() => router.push(`/night/${nightId}/reminders`)}
                  />
                  {Date.parse(snapshot.night.endsAt) <= now ? (
                    <NavigationRow
                      label="Night check-in"
                      icon="moon-outline"
                      onPress={() => router.push(`/night/${nightId}/planned-end`)}
                    />
                  ) : null}
                </Disclosure>
              ) : null}
            </>
          )}
          {host ? (
            <PrimaryButton
              label="Share invite"
              icon="share-outline"
              variant="secondary"
              busy={busy}
              disabled={logging.busy}
              onPress={() => router.push(`/night/${nightId}/invite`)}
            />
          ) : null}
          <NightPeople
            key={`${snapshot.currentUserId}:${nightId}`}
            snapshot={snapshot}
            busy={busy || logging.busy}
            refresh={refresh}
          />
          {message ? <Notice dismissible message={message} /> : null}
          {host ? (
            <Panel>
              <Disclosure title="Host options">
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
              </Disclosure>
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
          <PrimaryButton
            label="Report content or block someone"
            variant="quiet"
            onPress={() => router.push(`/night/${nightId}/report`)}
          />
          <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>
            DWD cannot determine sobriety or driving safety.
          </Text>
        </>
      )}
      {!snapshot &&
      status === 'signed-in' &&
      records.some((record) => record.nightId === nightId) ? (
        <NightActivity nightId={nightId} timezone="UTC" />
      ) : null}
    </Screen>
  );
}
