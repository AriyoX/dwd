import { useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  buildDrinkBreakdown,
  calculateMemberTotals,
  calculatePlanTotal,
  formatNightDateTime,
  type MemberSnapshot,
  type NightSnapshot,
} from '@dwd/core';
import { useTheme } from '@/providers/theme-provider';
import { Action } from './primary-button';
import { Notice, Panel } from './screen';
import { NightMetrics } from './night-metrics';

export function RecapTimeline({ snapshot }: { snapshot: NightSnapshot }) {
  const { colors, typography } = useTheme();
  const { night } = snapshot;
  const times = [
    ['Started', night.startsAt],
    ['Planned finish', night.initialEndsAt],
    ...(night.endsAt !== night.initialEndsAt ? [['Moved to', night.endsAt]] : []),
    ['Wrapped up', night.endedAt],
  ];
  return (
    <Panel>
      <Text accessibilityRole="header" style={typography.sectionTitle}>
        The evening
      </Text>
      {times.map(([label, time], index) => (
        <View key={label} style={{ flexDirection: 'row', gap: 14 }}>
          <View style={{ alignItems: 'center', width: 14 }} accessible={false}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: colors.muted,
                marginTop: 7,
              }}
            />
            {index < times.length - 1 ? (
              <View
                style={{
                  flex: 1,
                  minHeight: 25,
                  width: 1,
                  marginTop: 6,
                  backgroundColor: colors.border,
                }}
              />
            ) : null}
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={typography.body}>{label}</Text>
            <Text style={{ ...typography.body, color: colors.text, fontWeight: '500' }}>
              {formatNightDateTime(time ?? null, night.timezone)}
            </Text>
          </View>
        </View>
      ))}
      <Text style={typography.body}>{night.timezone || 'UTC'}</Text>
    </Panel>
  );
}

export function RecapMembers({ snapshot }: { snapshot: NightSnapshot }) {
  const { typography } = useTheme();
  return (
    <View style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={typography.sectionTitle}>
        {snapshot.historyScope === 'personal' ? 'Your night' : 'Everyone’s night'}
      </Text>
      {snapshot.members.map((member) => (
        <MemberRecap
          key={member.id}
          member={member}
          currentUserId={snapshot.currentUserId}
          timezone={snapshot.night.timezone}
        />
      ))}
      <Notice message="Amounts are approximate. They cannot tell you whether you are sober or safe to drive." />
    </View>
  );
}
function MemberRecap({
  member,
  currentUserId,
  timezone,
}: {
  member: MemberSnapshot;
  currentUserId: string;
  timezone: string;
}) {
  const { colors, typography } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const totals = calculateMemberTotals(member.drinkLogs, member.waterLogs);
  const plan = calculatePlanTotal(member.planItems.filter((item) => !item.archivedAt));
  const breakdown = buildDrinkBreakdown(member.drinkLogs);
  const addedLater = [
    ...member.drinkLogs
      .filter((log) => !log.deletedAt)
      .map((log) => ({ ...log, label: log.labelSnapshot })),
    ...member.waterLogs.filter((log) => !log.deletedAt).map((log) => ({ ...log, label: 'Chaser' })),
  ]
    .filter((log) => Date.parse(log.createdAt) - Date.parse(log.consumedAt) > 120_000)
    .sort((a, b) => Date.parse(a.consumedAt) - Date.parse(b.consumedAt));
  const role =
    member.memberType === 'guest'
      ? 'Guest'
      : member.userId === null
        ? 'Former member'
        : member.userId === currentUserId
          ? 'You'
          : member.role === 'host'
            ? 'Host'
            : 'Friend';
  return (
    <Panel>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          accessible={false}
          style={{
            width: 44,
            height: 44,
            borderRadius: 16,
            backgroundColor: colors.surfaceSoft,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text style={{ color: colors.muted, fontSize: 20, fontWeight: '600' }}>
            {member.displayName.slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={typography.sectionTitle}>{member.displayName}</Text>
          <Text style={typography.body}>{role}</Text>
        </View>
      </View>
      <NightMetrics drinks={totals.alcoholCount} water={totals.waterCount} />
      <Action
        label={`Drink details for ${member.displayName}`}
        expanded={expanded}
        onPress={() => setExpanded((value) => !value)}
        style={{ minHeight: 48, flexDirection: 'row', gap: 12, alignItems: 'center' }}
      >
        <Text style={{ ...typography.body, color: colors.primary, flex: 1 }}>Drink details</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.primary}
          accessible={false}
        />
      </Action>
      {expanded ? (
        <View style={{ gap: 16 }}>
          {breakdown.length ? (
            breakdown.map((drink, index) => (
              <View key={index} style={{ gap: 3 }}>
                <Text style={{ ...typography.body, color: colors.text }}>
                  {drink.count} × {drink.label}
                </Text>
                <Text style={typography.body}>
                  {drink.volumeMl} ml · {drink.abvPercent}% ABV
                </Text>
              </View>
            ))
          ) : (
            <Notice message="No alcoholic drinks logged" />
          )}
          <Detail label="Alcohol in drinks" value={`${totals.ethanolGrams.toFixed(1)} g`} />
          <Detail
            label="Alcohol in plan"
            value={plan === 0 ? 'Chaser only' : `${plan.toFixed(1)} g`}
          />
          <Detail label="Drinks after planned finish" value={String(totals.afterEndCount)} />
          {addedLater.length ? (
            <View style={{ gap: 8 }}>
              <Text style={{ ...typography.body, color: colors.text, fontWeight: '600' }}>
                Added later
              </Text>
              {addedLater.map((entry) => (
                <Text key={entry.id} style={typography.body}>
                  {entry.label} · about {formatNightDateTime(entry.consumedAt, timezone)}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </Panel>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  const { colors, typography } = useTheme();
  return (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}
    >
      <Text style={{ ...typography.body, flexShrink: 1 }}>{label}</Text>
      <Text style={{ ...typography.body, color: colors.text, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}
