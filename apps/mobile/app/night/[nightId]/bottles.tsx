import { useEffect, useRef, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Keyboard, RefreshControl, Text, View, type ScrollView } from 'react-native';
import * as Crypto from 'expo-crypto';
import { Ionicons } from '@expo/vector-icons';
import {
  bottleDrinkWord,
  bottleMainChoice,
  bottlePlanProgress,
  canUserDeleteLog,
  RECENT_CORRECTION_MINUTES,
  type MemberSnapshot,
  type NightSnapshot,
  type SharedBottle,
  type SharedBottleInput,
} from '@dwd/core';
import {
  closeSharedBottle,
  planSharedBottle,
  setBottleMembership,
  shareBottleAndPlan,
  softDeleteActivity,
} from '@dwd/data';
import { Choice } from '@/components/choice';
import { DrinkQuantity } from '@/components/drink-quantity';
import { SharedBottleFields } from '@/components/shared-bottle-fields';
import { Action, PrimaryButton } from '@/components/primary-button';
import { LoadingPanel, Notice, Panel, RetryPanel, Screen } from '@/components/screen';
import { SettingsRow } from '@/components/settings-row';
import { TextField } from '@/components/text-field';
import { useLogging } from '@/hooks/use-logging';
import { useNight, useNow } from '@/hooks/use-night';
import { useNightAction } from '@/hooks/use-night-action';
import {
  availableBottles,
  materializeBottle,
  materializeBottlePlan,
  nightAccess,
  newBottleDraft,
  bottleInputIssue,
  type BottleDraft,
} from '@/lib/night-features';
import { confirmAction } from '@/lib/confirm';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme } from '@/providers/theme-provider';
import { useConnectivity } from '@/providers/connectivity-provider';
import { RecoverableCommand } from '@/lib/recoverable-command';
import { actorClient } from '@/lib/actor-client';
import { withRequestTimeout } from '@/lib/request-timeout';

export default function BottlesScreen() {
  const { nightId, memberId, bottleId } = useLocalSearchParams<{
    nightId: string;
    memberId?: string;
    bottleId?: string;
  }>();
  const { colors } = useTheme();
  const { snapshot, issue, refresh, refreshing } = useNight(nightId);
  const scrollRef = useRef<ScrollView>(null);
  const access = snapshot ? nightAccess(snapshot, memberId ?? snapshot.currentMemberId) : null;
  return (
    <Screen
      sheetTitle="Shared bottles"
      scrollRef={scrollRef}
      insetTop={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh(true)}
          tintColor={colors.primary}
        />
      }
    >
      <Stack.Screen options={{ title: 'Shared bottles' }} />
      {!snapshot ? (
        issue ? (
          <RetryPanel issue={issue} retry={() => void refresh()} />
        ) : (
          <LoadingPanel />
        )
      ) : !access?.canLog || !access.member ? (
        <Notice message="You cannot manage bottles for this person or the night has ended." />
      ) : (
        <BottleShelf
          key={`${snapshot.currentUserId}:${access.member.id}:${bottleId ?? 'shelf'}`}
          initialBottleId={bottleId}
          snapshot={snapshot}
          member={access.member}
          refresh={refresh}
          onNavigate={() => {
            Keyboard.dismiss();
            scrollRef.current?.scrollTo({ y: 0, animated: false });
          }}
        />
      )}
      {snapshot && issue ? <RetryPanel issue={issue} retry={() => void refresh()} /> : null}
    </Screen>
  );
}

function BottleShelf({
  initialBottleId,
  snapshot,
  member,
  refresh,
  onNavigate,
}: {
  initialBottleId?: string | undefined;
  snapshot: NightSnapshot;
  member: MemberSnapshot;
  refresh: () => Promise<void>;
  onNavigate: () => void;
}) {
  const { client } = useSupabase();
  const router = useRouter();
  const { colors, typography } = useTheme();
  const now = useNow();
  const action = useNightAction(refresh);
  const logging = useLogging(() => void refresh(), snapshot);
  const [page, changePage] = useState<'shelf' | 'create' | 'plan'>(
    initialBottleId ? 'plan' : 'shelf',
  );
  const [formBusy, setFormBusy] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  function setPage(next: typeof page) {
    setSavedNotice(null);
    changePage(next);
    onNavigate();
  }
  function saved(message: string) {
    setPage('shelf');
    setSavedNotice(message);
  }
  const [selectedId, setSelectedId] = useState<string | null>(initialBottleId ?? null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const bottles = availableBottles(snapshot, member.id);
  const active = bottles.filter((b) => !b.closedAt);
  const selected = bottles.find((b) => b.id === selectedId && !b.closedAt);
  const busy = action.busy || logging.busy;
  function startLogging() {
    onNavigate();
    router.replace({
      pathname: `/night/${snapshot.night.id}/log`,
      params: { memberId: member.id },
    });
  }
  function fullPlan() {
    router.push({ pathname: `/night/${snapshot.night.id}/plan`, params: { memberId: member.id } });
  }
  async function close(bottle: SharedBottle) {
    if (!client || busy || bottle.creatorMemberId !== snapshot.currentMemberId) return;
    if (
      await confirmAction(
        'Put this bottle away?',
        `No more drinks can be logged from ${bottle.label}. Past drinks stay saved.`,
        'Put away',
      )
    )
      await action.run(() => closeSharedBottle(client, bottle.id), 'Bottle put away.');
  }
  function undo(bottle: SharedBottle) {
    const access = nightAccess(snapshot, member.id);
    const log = member.drinkLogs
      .filter((l) => l.sharedBottleId === bottle.id && !l.deletedAt)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
    if (
      !client ||
      !log ||
      busy ||
      now - Date.parse(log.createdAt) > RECENT_CORRECTION_MINUTES * 60_000 ||
      !canUserDeleteLog(
        {
          actorUserId: snapshot.currentUserId,
          actorMembership: access.actor,
          targetMember: member,
          night: snapshot.night,
        },
        log.actorUserId,
      )
    )
      return;
    void action.run(
      () => softDeleteActivity(client, log.id, 'alcohol'),
      'Drink removed. Bottle volume restored.',
    );
  }
  return (
    <>
      <Text style={typography.body}>For {member.displayName}</Text>
      {savedNotice ? <Notice dismissible message={savedNotice} /> : null}
      {action.issue || logging.issue ? (
        <Notice dismissible error message={action.issue ?? logging.issue ?? ''} />
      ) : null}
      {action.notice || logging.notice ? (
        <Notice dismissible message={action.notice ?? logging.notice ?? ''} />
      ) : null}
      {page !== 'shelf' ? (
        <PrimaryButton
          label="All bottles"
          icon="chevron-back"
          variant="quiet"
          disabled={formBusy}
          onPress={() => setPage('shelf')}
        />
      ) : null}
      {page === 'create' ? (
        <CreateBottle
          key={member.id}
          snapshot={snapshot}
          member={member}
          refresh={refresh}
          onBusy={setFormBusy}
          onSaved={() => saved('Bottle added. Friends can join from their night.')}
        />
      ) : page === 'plan' && selected ? (
        <BottlePlan
          key={`${selected.id}:${member.id}`}
          bottle={selected}
          member={member}
          refresh={refresh}
          onBusy={setFormBusy}
          onSaved={() => {
            if (member.planItems.some((p) => p.sharedBottleId === selected.id && !p.archivedAt)) {
              saved('Bottle plan saved.');
            } else {
              startLogging();
            }
          }}
          onFullPlan={fullPlan}
        />
      ) : page === 'plan' ? (
        <Notice message="This bottle is no longer available." />
      ) : (
        <>
          <PrimaryButton
            label="Add shared bottle"
            icon="add-outline"
            variant="secondary"
            disabled={busy}
            onPress={() => setPage('create')}
          />
          {!active.length ? (
            <View style={{ gap: 12, paddingVertical: 28, alignItems: 'center' }}>
              <Ionicons name="wine-outline" size={44} color={colors.primary} accessible={false} />
              <Text accessibilityRole="header" style={typography.sectionTitle}>
                No bottles on the table
              </Text>
            </View>
          ) : null}
          {active.map((bottle) => {
            const planned = member.planItems.find(
              (p) => p.sharedBottleId === bottle.id && !p.archivedAt,
            );
            const joined = bottle.joinedMemberIds.includes(member.id);
            const tracking = joined && planned;
            const size = planned?.volumeMl ?? bottle.pourMl;
            const word = bottleDrinkWord(bottle.category);
            const people = snapshot.members.filter(
              (p) => p.leftAt === null && bottle.joinedMemberIds.includes(p.id),
            );
            const log = member.drinkLogs
              .filter((l) => !l.deletedAt && l.sharedBottleId === bottle.id)
              .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
            const access = nightAccess(snapshot, member.id);
            const canUndo =
              log &&
              now - Date.parse(log.createdAt) <= RECENT_CORRECTION_MINUTES * 60_000 &&
              canUserDeleteLog(
                {
                  actorUserId: snapshot.currentUserId,
                  actorMembership: access.actor,
                  targetMember: member,
                  night: snapshot.night,
                },
                log.actorUserId,
              );
            return (
              <Panel key={bottle.id}>
                <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
                  <View
                    accessible={false}
                    style={{ backgroundColor: colors.primarySoft, padding: 14, borderRadius: 20 }}
                  >
                    <Ionicons name="wine-outline" size={28} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text accessibilityRole="header" style={typography.sectionTitle}>
                      {bottle.label}
                    </Text>
                    <Text style={typography.body}>
                      {size} ml per {word} · {bottle.abvPercent}% ABV
                    </Text>
                    {planned?.isQuickLog ? (
                      <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>
                        Main drink
                      </Text>
                    ) : null}
                  </View>
                </View>
                <Text style={typography.body}>
                  {bottle.access === 'everyone' ? 'Everyone can join' : 'Selected people'}
                </Text>
                {planned ? (
                  <Text style={typography.body}>
                    {bottlePlanProgress(bottle.id, member.drinkLogs, size)} {word}s logged ·{' '}
                    {planned.plannedQuantity} planned
                  </Text>
                ) : null}
                <Text
                  accessibilityLabel={`${bottle.remainingMl} of ${bottle.volumeMl} millilitres remaining`}
                  style={{ color: colors.text, fontSize: 21, fontWeight: '600' }}
                >
                  {bottle.remainingMl} ml left
                </Text>
                <View
                  accessible={false}
                  style={{
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: colors.surfaceSoft,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: colors.primary,
                      width: `${Math.max(0, Math.min(100, (bottle.remainingMl / bottle.volumeMl) * 100))}%`,
                    }}
                  />
                </View>
                <PrimaryButton
                  label={
                    bottle.remainingMl < 1
                      ? 'Bottle empty'
                      : tracking
                        ? size > bottle.remainingMl
                          ? `Log remaining ${bottle.remainingMl} ml`
                          : `Log ${word}`
                        : 'Join bottle'
                  }
                  large
                  busy={logging.busy}
                  disabled={action.busy || bottle.remainingMl < 1}
                  onPress={() => {
                    if (!tracking) {
                      setSelectedId(bottle.id);
                      setPage('plan');
                    } else
                      void logging.log(
                        member.id,
                        size > bottle.remainingMl
                          ? {
                              customDrink: {
                                sharedBottleId: bottle.id,
                                label: bottle.label,
                                category: bottle.category,
                                volumeMl: bottle.remainingMl,
                                abvPercent: bottle.abvPercent,
                              },
                            }
                          : { planItemId: planned.id },
                      );
                  }}
                />
                {tracking ? (
                  <PrimaryButton
                    label="Adjust my plan"
                    variant="secondary"
                    disabled={busy}
                    onPress={() => {
                      setSelectedId(bottle.id);
                      setPage('plan');
                    }}
                  />
                ) : null}
                {tracking && bottle.remainingMl > 0 && size > bottle.remainingMl ? (
                  <Notice
                    message={`The last ${bottle.remainingMl} ml will count as part of a drink.`}
                  />
                ) : null}
                {canUndo ? (
                  <PrimaryButton
                    label="Undo last drink"
                    icon="arrow-undo-outline"
                    variant="quiet"
                    disabled={busy}
                    onPress={() => undo(bottle)}
                  />
                ) : null}
                <Action
                  label={`People and options for ${bottle.label}`}
                  expanded={expanded === bottle.id}
                  onPress={() => setExpanded(expanded === bottle.id ? null : bottle.id)}
                  style={{ minHeight: 48, flexDirection: 'row', gap: 10, alignItems: 'center' }}
                >
                  <Ionicons
                    name="people-outline"
                    size={20}
                    color={colors.primary}
                    accessible={false}
                  />
                  <Text style={{ flex: 1, color: colors.primary, fontSize: 16 }}>
                    People and options
                  </Text>
                  <Ionicons
                    name={expanded === bottle.id ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.primary}
                    accessible={false}
                  />
                </Action>
                {expanded === bottle.id ? (
                  <>
                    <Text style={typography.body}>
                      {people.map((p) => p.displayName).join(', ') || 'No one has joined yet'}
                    </Text>
                    <Text style={typography.body}>
                      Shared by{' '}
                      {snapshot.members.find((p) => p.id === bottle.creatorMemberId)?.displayName ??
                        'a former member'}
                    </Text>
                    {joined ? (
                      <PrimaryButton
                        label={planned ? 'Remove from plan to leave' : 'Leave bottle'}
                        variant="quiet"
                        disabled={busy}
                        onPress={() => {
                          if (planned) fullPlan();
                          else if (client)
                            void action.run(
                              () => setBottleMembership(client, bottle.id, member.id, false),
                              'Left bottle.',
                            );
                        }}
                      />
                    ) : null}
                    {bottle.creatorMemberId === snapshot.currentMemberId ? (
                      <PrimaryButton
                        label="Put bottle away"
                        variant="danger"
                        disabled={busy}
                        onPress={() => void close(bottle)}
                      />
                    ) : null}
                  </>
                ) : null}
              </Panel>
            );
          })}
          {bottles.some((b) => b.closedAt) ? (
            <Panel>
              <Text accessibilityRole="header" style={typography.sectionTitle}>
                Put away
              </Text>
              {bottles
                .filter((b) => b.closedAt)
                .map((b) => (
                  <Text key={b.id} style={typography.body}>
                    {b.label} · {b.remainingMl} ml left
                  </Text>
                ))}
            </Panel>
          ) : null}
        </>
      )}
    </>
  );
}

function CreateBottle({
  snapshot,
  member,
  refresh,
  onSaved,
  onBusy,
}: {
  snapshot: NightSnapshot;
  member: MemberSnapshot;
  refresh: () => Promise<void>;
  onSaved: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const { client, session } = useSupabase();
  const { online } = useConnectivity();
  const { colors, typography } = useTheme();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [draft, setDraft] = useState<BottleDraft>(() => newBottleDraft(Crypto.randomUUID()));
  const [revision] = useState(member.planRevision);
  const creator = snapshot.members.find((person) => person.id === snapshot.currentMemberId);
  const [creatorRevision] = useState(creator?.planRevision ?? 0);
  const [targetChoice] = useState(() => bottleMainChoice(member.planItems));
  const [creatorChoice] = useState(() => bottleMainChoice(creator?.planItems ?? []));
  const [main, setMain] = useState(targetChoice.isMain);
  const [creatorMain, setCreatorMain] = useState(creatorChoice.isMain);
  const [command] = useState(
    () =>
      new RecoverableCommand<{
        bottle: SharedBottleInput;
        key: string;
        main: boolean;
        creatorMain: boolean;
      }>(),
  );
  const [submitted, setSubmitted] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const action = useNightAction(refresh);
  const frozen = action.busy || submitted;
  useEffect(() => {
    onBusy(action.busy);
    return () => onBusy(false);
  }, [action.busy, onBusy]);
  const update = (patch: Partial<BottleDraft>) => setDraft((old) => ({ ...old, ...patch }));
  async function save() {
    if (!client || !session || !nightAccess(snapshot, member.id).canLog) return;
    if (online === false) {
      setIssue('Connect to the internet to share a bottle.');
      return;
    }
    const parsed = materializeBottle(draft, member.id, snapshot.currentMemberId);
    if (!parsed.success) {
      setIssue(bottleInputIssue(parsed.error.issues[0]?.path[0]));
      return;
    }
    setIssue(null);
    const payload = command.capture(() => ({
      bottle: parsed.data,
      key: Crypto.randomUUID(),
      main,
      creatorMain,
    }));
    setSubmitted(true);
    await action.run(
      () =>
        withRequestTimeout((signal) =>
          shareBottleAndPlan(
            actorClient(client, session.access_token, signal),
            snapshot.night.id,
            payload.bottle,
            member.id,
            revision,
            payload.key,
            {
              makeMain: payload.main,
              creatorExpectedRevision: creatorRevision,
              creatorMakeMain:
                member.id === snapshot.currentMemberId ? payload.main : payload.creatorMain,
            },
          ),
        ),
      undefined,
      () => {
        command.complete();
        onSaved();
      },
      (error) => {
        command.reject(error);
        setSubmitted(command.pending);
      },
    );
  }
  return (
    <>
      <SharedBottleFields
        draft={draft}
        disabled={frozen}
        error={Boolean(issue)}
        onChange={(patch) => {
          update(patch);
          setIssue(null);
        }}
      />
      <MainDrinkChoice
        label={
          member.id === snapshot.currentMemberId
            ? 'Make this my main drink'
            : `Make this ${member.displayName}’s main drink`
        }
        choice={targetChoice}
        value={main}
        disabled={frozen}
        onChange={setMain}
      />
      {member.id !== snapshot.currentMemberId ? (
        <MainDrinkChoice
          label="Make this my main drink"
          choice={creatorChoice}
          value={creatorMain}
          disabled={frozen}
          onChange={setCreatorMain}
        />
      ) : null}
      <Action
        label="Sharing options"
        expanded={optionsOpen}
        onPress={() => setOptionsOpen(!optionsOpen)}
        style={{ minHeight: 48, flexDirection: 'row', gap: 12, alignItems: 'center' }}
      >
        <Text style={[typography.sectionTitle, { flex: 1 }]}>Sharing options</Text>
        <Ionicons
          name={optionsOpen ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.primary}
          accessible={false}
        />
      </Action>
      {optionsOpen ? (
        <>
          <Text accessibilityRole="header" style={typography.sectionTitle}>
            Who can join?
          </Text>
          <Choice
            label="Everyone"
            selected={draft.access === 'everyone'}
            disabled={frozen}
            onPress={() => update({ access: 'everyone' })}
          />
          <Choice
            label="Choose people"
            selected={draft.access === 'selected'}
            disabled={frozen}
            onPress={() => update({ access: 'selected' })}
          />
          {draft.access === 'selected'
            ? snapshot.members
                .filter(
                  (p) =>
                    p.leftAt === null && p.id !== snapshot.currentMemberId && p.id !== member.id,
                )
                .map((p) => (
                  <SettingsRow
                    key={p.id}
                    label={p.displayName}
                    value={draft.allowedMemberIds.includes(p.id)}
                    disabled={frozen}
                    onChange={(value) =>
                      update({
                        allowedMemberIds: value
                          ? [...draft.allowedMemberIds, p.id]
                          : draft.allowedMemberIds.filter((id) => id !== p.id),
                      })
                    }
                  />
                ))
            : null}
        </>
      ) : null}
      <Notice
        message={
          member.id === snapshot.currentMemberId
            ? 'Friends choose whether to join.'
            : `Plans the same drinks for you and ${member.displayName}. Friends choose whether to join.`
        }
      />
      {issue || action.issue ? <Notice error message={issue ?? action.issue ?? ''} /> : null}
      <PrimaryButton
        label={submitted ? 'Try again' : 'Add bottle'}
        busy={action.busy}
        onPress={() => void save()}
      />
    </>
  );
}

function BottlePlan({
  bottle,
  member,
  refresh,
  onSaved,
  onFullPlan,
  onBusy,
}: {
  bottle: SharedBottle;
  member: MemberSnapshot;
  refresh: () => Promise<void>;
  onSaved: () => void;
  onFullPlan: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const { client, session } = useSupabase();
  const { online } = useConnectivity();
  const { typography } = useTheme();
  const existing = member.planItems.find((p) => !p.archivedAt && p.sharedBottleId === bottle.id);
  const [choice] = useState(() => bottleMainChoice(member.planItems, bottle.id));
  const [quantity, setQuantity] = useState(
    String(existing?.plannedQuantity ?? bottle.defaultQuantity),
  );
  const [size, setSize] = useState(String(existing?.volumeMl ?? bottle.pourMl));
  const [main, setMain] = useState(choice.isMain);
  const [revision] = useState(member.planRevision);
  const [command] = useState(
    () => new RecoverableCommand<{ quantity: number; size: number; main: boolean; key: string }>(),
  );
  const [submitted, setSubmitted] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const action = useNightAction(refresh);
  const frozen = action.busy || submitted;
  useEffect(() => {
    onBusy(action.busy);
    return () => onBusy(false);
  }, [action.busy, onBusy]);
  async function save() {
    if (!client || !session) return;
    if (online === false) {
      setIssue('Connect to the internet to adjust a shared bottle.');
      return;
    }
    const parsed = materializeBottlePlan(quantity, size, bottle.volumeMl);
    if (!parsed.success) {
      setIssue(`Choose 1–50 drinks and a drink size of 1–${Math.min(2000, bottle.volumeMl)} ml.`);
      return;
    }
    setIssue(null);
    const payload = command.capture(() => ({
      quantity: parsed.data.plannedQuantity,
      size: parsed.data.volumeMl,
      main,
      key: Crypto.randomUUID(),
    }));
    setSubmitted(true);
    await action.run(
      () =>
        withRequestTimeout((signal) =>
          planSharedBottle(
            actorClient(client, session.access_token, signal),
            bottle.id,
            member.id,
            payload.quantity,
            payload.size,
            revision,
            payload.key,
            payload.main,
          ),
        ),
      undefined,
      () => {
        command.complete();
        onSaved();
      },
      (error) => {
        command.reject(error);
        setSubmitted(command.pending);
      },
    );
  }
  return (
    <>
      <Text accessibilityRole="header" style={typography.sectionTitle}>
        {existing ? 'Adjust my plan' : 'Join bottle'} · {bottle.label}
      </Text>
      <Text style={typography.body}>
        {bottle.remainingMl} ml left · {bottle.abvPercent}% ABV
      </Text>
      <DrinkQuantity
        label={`Planned ${bottleDrinkWord(bottle.category)}s`}
        value={quantity}
        disabled={frozen}
        onChange={setQuantity}
      />
      <TextField
        label="Drink size (ml)"
        value={size}
        keyboardType="decimal-pad"
        editable={!frozen}
        onChangeText={setSize}
      />
      <MainDrinkChoice
        label={
          member.userId === session?.user.id
            ? 'Use as my main drink'
            : `Use as ${member.displayName}'s main drink`
        }
        choice={choice}
        value={main}
        disabled={frozen}
        onChange={setMain}
      />
      {!existing ? (
        <Notice message="Joining adds this bottle to your plan. Your earlier drinks stay saved." />
      ) : null}
      <Notice message={`Logging a drink uses ${size} ml from this bottle.`} />
      {issue || action.issue ? <Notice error message={issue ?? action.issue ?? ''} /> : null}
      <PrimaryButton
        label={
          submitted
            ? 'Try again'
            : existing
              ? 'Save changes'
              : main
                ? 'Join & use as main'
                : 'Join bottle'
        }
        busy={action.busy}
        onPress={() => void save()}
      />
      <PrimaryButton
        label="Edit full plan"
        variant="quiet"
        disabled={frozen}
        onPress={onFullPlan}
      />
    </>
  );
}

function MainDrinkChoice({
  label,
  choice,
  value,
  disabled,
  onChange,
}: {
  label: string;
  choice: ReturnType<typeof bottleMainChoice>;
  value: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const { typography } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <SettingsRow
        label={label}
        value={value}
        disabled={disabled || choice.required}
        onChange={onChange}
      />
      <Text style={typography.body}>
        {choice.required
          ? choice.currentMainLabel
            ? 'Already the main drink. Choose another in the full plan to change it.'
            : 'The first planned drink is the main drink.'
          : value
            ? `Replaces ${choice.currentMainLabel} as the main drink.`
            : `Keeps ${choice.currentMainLabel} as the main drink.`}
      </Text>
    </View>
  );
}
