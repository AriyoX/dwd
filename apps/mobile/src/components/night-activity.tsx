import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { RECENT_CORRECTION_MINUTES, type MemberSnapshot } from '@dwd/core';
import { useTheme } from '@/providers/theme-provider';
import { Action } from './primary-button';
import { Notice, Panel } from './screen';

export function NightActivity({
  member,
  timezone,
  canUndo,
  onUndo,
  busy = false,
  now,
}: {
  member: MemberSnapshot;
  timezone: string;
  canUndo?: (actorId: string | null) => boolean;
  onUndo?: (id: string, kind: 'alcohol' | 'water') => void;
  busy?: boolean;
  now?: number;
}) {
  const { colors, typography } = useTheme();
  const entries = [
    ...member.drinkLogs
      .filter((log) => !log.deletedAt)
      .map((log) => ({
        ...log,
        kind: 'alcohol' as const,
        label: log.labelSnapshot,
        detail: `${log.volumeMl} ml · ${log.abvPercent}% ABV`,
      })),
    ...member.waterLogs
      .filter((log) => !log.deletedAt)
      .map((log) => ({ ...log, kind: 'water' as const, label: 'Chaser', detail: null })),
  ].sort((a, b) => Date.parse(b.consumedAt) - Date.parse(a.consumedAt));
  return (
    <View style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={typography.sectionTitle}>
        Activity
      </Text>
      {!entries.length ? (
        <Panel>
          <Notice message="No drinks logged yet" />
        </Panel>
      ) : (
        <Panel style={{ gap: 0 }}>
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 14,
                    backgroundColor: entry.kind === 'water' ? colors.waterSoft : colors.primarySoft,
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
                <View style={{ flex: 1, gap: 4 }}>
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
          ))}
        </Panel>
      )}
    </View>
  );
}
