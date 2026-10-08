import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import type { NightSnapshot } from '@dwd/core';
import { removeManagedGuest } from '@dwd/data';
import { useNightAction } from '@/hooks/use-night-action';
import { confirmAction } from '@/lib/confirm';
import { nightAccess } from '@/lib/night-features';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme } from '@/providers/theme-provider';
import { useCheckIns } from './night-check-ins';
import { Action, PrimaryButton } from './primary-button';
import { Notice, Panel } from './screen';

export function NightPeople({
  snapshot,
  busy,
  refresh,
}: {
  snapshot: NightSnapshot;
  busy: boolean;
  refresh: () => Promise<void>;
}) {
  const router = useRouter();
  const { client } = useSupabase();
  const { colors, typography } = useTheme();
  const action = useNightAction(refresh);
  const checkIns = useCheckIns(snapshot, refresh);
  const disabled = busy || action.busy || checkIns.busy;
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <View style={{ gap: 16 }}>
      <Text accessibilityRole="header" style={typography.sectionTitle}>
        People
      </Text>
      <Panel style={{ gap: 0 }}>
        {snapshot.members.map((member, index) => {
          const access = nightAccess(snapshot, member.id);
          return (
            <View
              key={member.id}
              style={{
                gap: 12,
                paddingVertical: 16,
                borderTopWidth: index === 0 ? 0 : 0.5,
                borderColor: colors.border,
              }}
            >
              <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                <View
                  accessible={false}
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 21,
                    backgroundColor: colors.surfaceSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: colors.muted, fontSize: 17, fontWeight: '600' }}>
                    {member.displayName.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>
                    {member.displayName}
                    {member.role === 'host' ? ' · Host' : ''}
                    {member.userId === snapshot.currentUserId ? ' · You' : ''}
                  </Text>
                  <Text style={typography.body}>
                    {member.leftAt !== null
                      ? 'Left the night'
                      : member.memberType === 'guest'
                        ? access.canManage
                          ? 'You log for them'
                          : 'Host logs for them'
                        : 'Logs their own drinks'}
                  </Text>
                </View>
              </View>
              <Text style={typography.body}>
                {member.drinkLogs.filter((l) => !l.deletedAt).length} drinks ·{' '}
                {member.waterLogs.filter((l) => !l.deletedAt).length} chasers
              </Text>
              <Text style={typography.body}>
                {member.planSetupCompletedAt === null
                  ? 'No plan yet'
                  : !member.planItems.some((p) => !p.archivedAt)
                    ? 'Chaser only'
                    : `${member.planItems.filter((p) => !p.archivedAt).reduce((sum, p) => sum + p.plannedQuantity, 0)} drinks planned`}
              </Text>
              {access.canCheckIn ? (
                <PrimaryButton
                  label={member.memberType === 'guest' ? 'Ask host to check in' : 'Check in'}
                  icon="chatbubble-outline"
                  variant="quiet"
                  busy={checkIns.busy && checkIns.sendingMemberId === member.id}
                  busyLabel="Sending check-in"
                  disabled={disabled}
                  onPress={() => void checkIns.send(member.id)}
                />
              ) : null}
              {access.canManage ? (
                <PrimaryButton
                  label={`Log for ${member.displayName}`}
                  icon="add-outline"
                  variant="secondary"
                  disabled={disabled}
                  onPress={() =>
                    router.push({
                      pathname: `/night/${snapshot.night.id}/log`,
                      params: { memberId: member.id },
                    })
                  }
                />
              ) : null}
              {checkIns.feedbackMemberId === member.id && (checkIns.issue || checkIns.notice) ? (
                <Notice
                  error={Boolean(checkIns.issue)}
                  message={checkIns.issue ?? checkIns.notice ?? ''}
                />
              ) : null}
              {access.canManage ? (
                <Action
                  label={`Manage ${member.displayName}`}
                  expanded={expanded === member.id}
                  disabled={disabled}
                  onPress={() => setExpanded(expanded === member.id ? null : member.id)}
                  style={{ minHeight: 48, flexDirection: 'row', gap: 10, alignItems: 'center' }}
                >
                  <Text style={{ flex: 1, color: colors.primary, fontSize: 16 }}>
                    Manage {member.displayName}
                  </Text>
                  <Ionicons
                    name={expanded === member.id ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.primary}
                    accessible={false}
                  />
                </Action>
              ) : null}
              {access.canManage && expanded === member.id ? (
                <>
                  <PrimaryButton
                    label="Shared bottles"
                    icon="wine-outline"
                    variant="quiet"
                    disabled={disabled}
                    onPress={() =>
                      router.push({
                        pathname: `/night/${snapshot.night.id}/bottles`,
                        params: { memberId: member.id },
                      })
                    }
                  />
                  <PrimaryButton
                    label="Edit plan"
                    variant="quiet"
                    disabled={disabled}
                    onPress={() =>
                      router.push({
                        pathname: `/night/${snapshot.night.id}/plan`,
                        params: { memberId: member.id },
                      })
                    }
                  />
                  <PrimaryButton
                    label={`Remove ${member.displayName}`}
                    variant="danger"
                    disabled={disabled}
                    onPress={() => {
                      void (async () => {
                        if (
                          !client ||
                          disabled ||
                          !(await confirmAction(
                            `Remove ${member.displayName}?`,
                            'You will stop logging for them. Their past entries stay in the night recap.',
                            'Remove person',
                            true,
                          ))
                        )
                          return;
                        await action.run(
                          () => removeManagedGuest(client, member.id),
                          `${member.displayName} removed. Past entries stay saved.`,
                        );
                      })();
                    }}
                  />
                </>
              ) : null}
            </View>
          );
        })}
      </Panel>
      {nightAccess(snapshot).canAddGuest ? (
        <PrimaryButton
          label="Add person"
          icon="person-add-outline"
          variant="secondary"
          disabled={disabled}
          onPress={() => router.push(`/night/${snapshot.night.id}/guest`)}
        />
      ) : null}
      {action.issue ? <Notice error message={action.issue} /> : null}
      {action.notice ? <Notice dismissible message={action.notice} /> : null}
    </View>
  );
}
