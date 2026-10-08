import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { useState } from 'react';
import { RECENT_CORRECTION_MINUTES, type MemberSnapshot, type NightSnapshot } from '@dwd/core';
import { useOffline } from '@/providers/offline-provider';
import { pendingForSnapshot } from '@/lib/offline-logging';
import { useTheme } from '@/providers/theme-provider';
import { Action } from './primary-button';
import { Notice, Panel } from './screen';
import { PendingLogs } from './pending-logs';

export function NightActivity({
  member,
  timezone,
  canUndo,
  onUndo,
  busy = false,
  now,
  snapshot,
  nightId,
  title = 'Entries',
}: {
  member?: MemberSnapshot;
  timezone: string;
  canUndo?: (actorId: string | null) => boolean;
  onUndo?: (id: string, kind: 'alcohol' | 'water') => void;
  busy?: boolean;
  now?: number;
  snapshot?: NightSnapshot;
  nightId?: string;
  title?: string;
}) {
  const { colors, typography } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const { records } = useOffline();
  const pending = (
    snapshot
      ? pendingForSnapshot(snapshot, records)
      : records.filter((record) => !nightId || record.nightId === nightId)
  ).filter((record) => !member || record.nightMemberId === member.id);
  const entries = [
    ...(member?.drinkLogs ?? [])
      .filter((log) => !log.deletedAt)
      .map((log) => ({
        ...log,
        kind: 'alcohol' as const,
        label: log.labelSnapshot,
        detail: `${log.volumeMl} ml · ${log.abvPercent}%`,
      })),
    ...(member?.waterLogs ?? [])
      .filter((log) => !log.deletedAt)
      .map((log) => ({ ...log, kind: 'water' as const, label: 'Chaser', detail: null })),
  ].sort((a, b) => Date.parse(b.consumedAt) - Date.parse(a.consumedAt));
  return (
    <View
      style={{
        gap: expanded ? 8 : 0,
        backgroundColor: colors.surface,
        borderRadius: 18,
        paddingHorizontal: 16,
        paddingBottom: expanded ? 12 : 0,
      }}
    >
      <Action
        label={`${expanded ? 'Hide' : 'View'} ${title.toLowerCase()}. ${entries.length + pending.length} entries${pending.length ? `, ${pending.length} saved on phone` : ''}`}
        expanded={expanded}
        onPress={() => setExpanded((value) => !value)}
        style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <View style={{ flex: 1, gap: 4, paddingVertical: 10 }}>
          <Text style={{ color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: '600' }}>
            {title}
          </Text>
          {pending.length ? (
            <Text style={{ color: colors.muted, fontSize: 13, flexShrink: 1 }}>
              {pending.some(
                (record) =>
                  record.status === 'permanent_failure' || record.status === 'needs_confirmation',
              )
                ? 'Review needed'
                : `${pending.length} on phone`}
            </Text>
          ) : null}
        </View>
        <Text style={{ color: colors.muted, fontSize: 15, fontVariant: ['tabular-nums'] }}>
          {entries.length + pending.length}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.primary}
          accessible={false}
        />
      </Action>
      {expanded ? (
        <>
          <PendingLogs
            {...(snapshot ? { snapshot } : {})}
            {...(nightId ? { nightId } : {})}
            {...(member ? { memberId: member.id } : {})}
          />
          {!entries.length && !pending.length ? (
            <Panel>
              <Notice message="No entries yet" />
            </Panel>
          ) : entries.length ? (
            <Panel style={{ gap: 0, padding: 0, borderWidth: 0 }}>
              {entries.map((entry, index) => (
                <View
                  key={entry.id}
                  style={{
                    gap: 8,
                    paddingVertical: 14,
                    borderTopWidth: index === 0 ? 0 : 0.5,
                    borderColor: colors.border,
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 14,
                        backgroundColor:
                          entry.kind === 'water' ? colors.waterSoft : colors.primarySoft,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons
                        name={entry.kind === 'water' ? 'water-outline' : 'wine-outline'}
                        size={24}
                        color={entry.kind === 'water' ? colors.water : colors.primary}
                        accessible={false}
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 100, gap: 4 }}>
                      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
                        {entry.label}
                      </Text>
                      {entry.detail ? <Text style={typography.body}>{entry.detail}</Text> : null}
                      <Text style={typography.body}>
                        {new Date(entry.consumedAt).toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit',
                          timeZone: timezone,
                        })}
                      </Text>
                    </View>
                    {onUndo &&
                    now !== undefined &&
                    now - Date.parse(entry.createdAt) <= RECENT_CORRECTION_MINUTES * 60_000 &&
                    canUndo?.(entry.actorUserId) ? (
                      <Action
                        label={`Undo ${entry.label}`}
                        disabled={busy}
                        onPress={() => onUndo(entry.id, entry.kind)}
                        style={{
                          minHeight: 48,
                          justifyContent: 'center',
                          alignItems: 'flex-end',
                          paddingHorizontal: 12,
                          borderRadius: 12,
                          backgroundColor: 'transparent',
                        }}
                      >
                        <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '600' }}>
                          Undo
                        </Text>
                      </Action>
                    ) : null}
                  </View>
                </View>
              ))}
            </Panel>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
