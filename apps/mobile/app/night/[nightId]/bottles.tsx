import { useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { RefreshControl, Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { Ionicons } from '@expo/vector-icons';
import {
  bottleDrinkWord,
  bottlePlanProgress,
  canUserDeleteLog,
  RECENT_CORRECTION_MINUTES,
  type MemberSnapshot,
  type NightSnapshot,
  type SharedBottle,
} from '@dwd/core';
import {
  closeSharedBottle,
  planSharedBottle,
  setBottleMembership,
  shareBottleAndPlan,
  softDeleteActivity,
} from '@dwd/data';
import { Choice } from '@/components/choice';
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
  type BottleDraft,
} from '@/lib/night-features';
import { confirmAction } from '@/lib/confirm';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme } from '@/providers/theme-provider';

export default function BottlesScreen() {
  const { nightId, memberId } = useLocalSearchParams<{ nightId: string; memberId?: string }>();
  const { colors } = useTheme();
  const { snapshot, issue, refresh, loading } = useNight(nightId);
  const access = snapshot ? nightAccess(snapshot, memberId ?? snapshot.currentMemberId) : null;
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
          key={`${snapshot.currentUserId}:${access.member.id}`}
          snapshot={snapshot}
          member={access.member}
          refresh={refresh}
        />
      )}
      {snapshot && issue ? <RetryPanel issue={issue} retry={() => void refresh()} /> : null}
    </Screen>
  );
}

function BottleShelf({
  snapshot,
  member,
  refresh,
}: {
  snapshot: NightSnapshot;
  member: MemberSnapshot;
  refresh: () => Promise<void>;
}) {
  const { client } = useSupabase();
  const router = useRouter();
  const { colors, typography } = useTheme();
  const now = useNow();
  const action = useNightAction(refresh);
  const logging = useLogging(() => void refresh(), snapshot);
  const [page, setPage] = useState<'shelf' | 'create' | 'plan'>('shelf');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const bottles = availableBottles(snapshot, member.id);
  const active = bottles.filter((b) => !b.closedAt);
  const selected = bottles.find((b) => b.id === selectedId && !b.closedAt);
  const busy = action.busy || logging.busy;
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
      {page !== 'shelf' ? (
        <PrimaryButton
          label="All bottles"
          icon="chevron-back"
          variant="quiet"
          onPress={() => setPage('shelf')}
        />
      ) : null}
      {page === 'create' ? (
        <CreateBottle
          key={member.id}
          snapshot={snapshot}
          member={member}
          refresh={refresh}
          onSaved={() => setPage('shelf')}
        />
      ) : page === 'plan' && selected ? (
        <BottlePlan
          key={`${selected.id}:${member.id}`}
          bottle={selected}
          member={member}
          refresh={refresh}
          onSaved={() => setPage('shelf')}
          onFullPlan={fullPlan}
        />
      ) : page === 'plan' ? (
        <Notice message="This bottle is no longer available." />
      ) : (
        <>
          <PrimaryButton
            label="Share a bottle"
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
                        ? `Log ${word}`
                        : 'Join bottle'
                  }
                  busy={logging.busy}
                  disabled={
                    action.busy ||
                    bottle.remainingMl < 1 ||
                    Boolean(tracking && size > bottle.remainingMl)
                  }
                  onPress={() => {
                    if (!tracking) {
                      setSelectedId(bottle.id);
                      setPage('plan');
                    } else void logging.log(member.id, { planItemId: planned.id });
                  }}
                />
                {tracking ? (
                  <PrimaryButton
                    label="Adjust drinks"
                    variant="secondary"
                    disabled={busy}
                    onPress={() => {
                      setSelectedId(bottle.id);
                      setPage('plan');
                    }}
                  />
                ) : null}
                {tracking && bottle.remainingMl > 0 && size > bottle.remainingMl ? (
                  <Notice message="Less than one drink is left. Adjust the size to log it." />
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
      {action.issue || logging.issue ? (
        <Notice error message={action.issue ?? logging.issue ?? ''} />
      ) : null}
      {action.notice || logging.notice ? (
        <Notice message={action.notice ?? logging.notice ?? ''} />
      ) : null}
    </>
  );
}

function CreateBottle({
  snapshot,
  member,
  refresh,
  onSaved,
}: {
  snapshot: NightSnapshot;
  member: MemberSnapshot;
  refresh: () => Promise<void>;
  onSaved: () => void;
}) {
  const { client } = useSupabase();
  const { typography } = useTheme();
  const [draft, setDraft] = useState<BottleDraft>(() => ({
    id: Crypto.randomUUID(),
    label: '',
    category: 'spirit',
    volumeMl: '750',
    abvPercent: '40',
    pourMl: '30',
    defaultQuantity: '1',
    access: 'everyone',
    allowedMemberIds: [],
  }));
  const [revision] = useState(member.planRevision);
  const [requestKey] = useState(Crypto.randomUUID);
  const [issue, setIssue] = useState<string | null>(null);
  const action = useNightAction(refresh);
  const update = (patch: Partial<BottleDraft>) => setDraft((old) => ({ ...old, ...patch }));
  async function save() {
    if (!client || !nightAccess(snapshot, member.id).canLog) return;
    const parsed = materializeBottle(draft, member.id, snapshot.currentMemberId);
    if (!parsed.success) {
      setIssue(parsed.error.issues[0]?.message ?? 'Check the bottle details.');
      return;
    }
    setIssue(null);
    await action.run(
      () =>
        shareBottleAndPlan(client, snapshot.night.id, parsed.data, member.id, revision, requestKey),
      undefined,
      onSaved,
    );
  }
  return (
    <>
      <TextField
        label="Bottle name"
        value={draft.label}
        maxLength={60}
        editable={!action.busy}
        onChangeText={(label) => update({ label })}
      />
      <Text accessibilityRole="header" style={typography.sectionTitle}>
        What’s in the bottle?
      </Text>
      {(['spirit', 'wine', 'beer', 'cocktail', 'other'] as const).map((category) => (
        <Choice
          key={category}
          label={
            category === 'spirit'
              ? 'Spirit / shots'
              : category.charAt(0).toUpperCase() + category.slice(1)
          }
          selected={draft.category === category}
          disabled={action.busy}
          onPress={() =>
            update({
              category,
              ...(category === 'wine'
                ? { abvPercent: '12', pourMl: '150' }
                : category === 'spirit'
                  ? { abvPercent: '40', pourMl: '30' }
                  : category === 'beer'
                    ? { abvPercent: '5', pourMl: '330' }
                    : { abvPercent: '' }),
            })
          }
        />
      ))}
      <TextField
        label="Bottle size (ml)"
        keyboardType="decimal-pad"
        value={draft.volumeMl}
        editable={!action.busy}
        onChangeText={(volumeMl) => update({ volumeMl })}
      />
      <TextField
        label="Alcohol strength (%)"
        keyboardType="decimal-pad"
        value={draft.abvPercent}
        editable={!action.busy}
        onChangeText={(abvPercent) => update({ abvPercent })}
      />
      <TextField
        label="Drink size (ml)"
        keyboardType="decimal-pad"
        value={draft.pourMl}
        editable={!action.busy}
        onChangeText={(pourMl) => update({ pourMl })}
      />
      <TextField
        label={`Planned ${bottleDrinkWord(draft.category)}s`}
        keyboardType="number-pad"
        value={draft.defaultQuantity}
        editable={!action.busy}
        onChangeText={(defaultQuantity) => update({ defaultQuantity })}
      />
      <Notice message="Check the bottle’s label. For mixed drinks, count only the alcohol, without the mixer." />
      <Text accessibilityRole="header" style={typography.sectionTitle}>
        Who can join?
      </Text>
      <Choice
        label="Everyone"
        selected={draft.access === 'everyone'}
        disabled={action.busy}
        onPress={() => update({ access: 'everyone' })}
      />
      <Choice
        label="Choose people"
        selected={draft.access === 'selected'}
        disabled={action.busy}
        onPress={() => update({ access: 'selected' })}
      />
      {draft.access === 'selected'
        ? snapshot.members
            .filter(
              (p) => p.leftAt === null && p.id !== snapshot.currentMemberId && p.id !== member.id,
            )
            .map((p) => (
              <SettingsRow
                key={p.id}
                label={p.displayName}
                value={draft.allowedMemberIds.includes(p.id)}
                disabled={action.busy}
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
      <Notice message="This bottle becomes the main drink for the person you’re tracking." />
      {issue || action.issue ? <Notice error message={issue ?? action.issue ?? ''} /> : null}
      <PrimaryButton
        label="Share and start tracking"
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
}: {
  bottle: SharedBottle;
  member: MemberSnapshot;
  refresh: () => Promise<void>;
  onSaved: () => void;
  onFullPlan: () => void;
}) {
  const { client } = useSupabase();
  const { typography } = useTheme();
  const existing = member.planItems.find((p) => !p.archivedAt && p.sharedBottleId === bottle.id);
  const [quantity, setQuantity] = useState(
    String(existing?.plannedQuantity ?? bottle.defaultQuantity ?? 1),
  );
  const [size, setSize] = useState(String(existing?.volumeMl ?? bottle.pourMl));
  const [main, setMain] = useState(existing?.isQuickLog ?? true);
  const [revision] = useState(member.planRevision);
  const [requestKey] = useState(Crypto.randomUUID);
  const [issue, setIssue] = useState<string | null>(null);
  const action = useNightAction(refresh);
  async function save() {
    if (!client) return;
    const parsed = materializeBottlePlan(quantity, size);
    if (!parsed.success) {
      setIssue('Choose 1–50 drinks and a drink size of 1–2000 ml.');
      return;
    }
    setIssue(null);
    await action.run(
      () =>
        planSharedBottle(
          client,
          bottle.id,
          member.id,
          parsed.data.plannedQuantity,
          parsed.data.volumeMl,
          revision,
          requestKey,
          main,
        ),
      undefined,
      onSaved,
    );
  }
  return (
    <>
      <Text accessibilityRole="header" style={typography.sectionTitle}>
        {existing ? 'Adjust drinks' : 'Join bottle'} · {bottle.label}
      </Text>
      <Text style={typography.body}>
        {bottle.remainingMl} ml left · {bottle.abvPercent}% ABV
      </Text>
      <TextField
        label={`Planned ${bottleDrinkWord(bottle.category)}s`}
        value={quantity}
        keyboardType="number-pad"
        editable={!action.busy}
        onChangeText={setQuantity}
      />
      <TextField
        label="Drink size (ml)"
        value={size}
        keyboardType="decimal-pad"
        editable={!action.busy}
        onChangeText={setSize}
      />
      <SettingsRow
        label="Make this the main drink"
        value={main}
        disabled={action.busy}
        onChange={setMain}
      />
      <Notice message="This adds or updates this bottle in the plan. Your other planned drinks stay included." />
      {issue || action.issue ? <Notice error message={issue ?? action.issue ?? ''} /> : null}
      <PrimaryButton
        label={existing ? 'Save changes' : 'Join and start tracking'}
        busy={action.busy}
        onPress={() => void save()}
      />
      <PrimaryButton
        label="Edit full plan"
        variant="quiet"
        disabled={action.busy}
        onPress={onFullPlan}
      />
    </>
  );
}
