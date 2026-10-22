import { useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  availableQuickEntries,
  quickCountLabel,
  quickLinkedNight,
  unresolvedQuickTransfers,
} from '@dwd/core';
import { useQuickSync } from '@/providers/quick-sync-provider';
import { useQuickLog } from '@/hooks/use-quick-log';
import { PrimaryButton } from '@/components/primary-button';
import { Notice, Panel, Screen, ScreenHeading } from '@/components/screen';
import { useTheme } from '@/providers/theme-provider';
import { confirmAction } from '@/lib/confirm';
import { Disclosure } from '@/components/disclosure';

export default function QuickHistoryScreen() {
  const { scope: param } = useLocalSearchParams<{ scope?: string }>();
  const { store, state, scope } = useQuickLog(param === 'guest');
  const { colors, typography } = useTheme();
  const router = useRouter();
  const [issue, setIssue] = useState<string | null>(null);
  const sync = useQuickSync();
  const sessions = state.record.sessions.filter(
    (s) => (scope !== 'guest' || !s.claimedBy) && s.entries.some((entry) => !entry.removedAt),
  );
  return (
    <Screen insetTop={false} hidePermissionReminder>
      <ScreenHeading title="Past quick sessions" />
      {sessions.length ? (
        [...sessions]
          .sort(
            (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id),
          )
          .map((s) => {
            const linked = quickLinkedNight(s);
            const entries = s.entries.filter((entry) => !entry.removedAt);
            const remaining = availableQuickEntries(s).length;
            return (
              <Panel key={s.id}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <Text style={{ ...typography.body, color: colors.muted }}>
                    {new Date(s.createdAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                    {' · '}
                    {new Date(s.createdAt).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </Text>
                  <Text
                    style={{
                      color: colors.primary,
                      backgroundColor: colors.primarySoft,
                      borderRadius: 12,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      fontWeight: '600',
                    }}
                  >
                    {linked
                      ? 'Added to a night'
                      : s.state === 'active'
                        ? 'In progress'
                        : 'Finished'}
                  </Text>
                </View>
                <Text style={{ ...typography.body, color: colors.muted }}>
                  {linked ? 'Earlier Quick Log entries' : 'Quick Log session'}
                </Text>
                <Text
                  accessibilityRole="header"
                  style={{ ...typography.sectionTitle, fontVariant: ['tabular-nums'] }}
                >
                  {quickCountLabel(entries)}
                </Text>
                {entries.some((e) => e.kind === 'shot') ? (
                  <Text style={typography.body}>
                    Includes {entries.filter((e) => e.kind === 'shot').length} shots.
                  </Text>
                ) : null}
                {linked ? (
                  <>
                    <Text style={typography.body}>
                      {remaining
                        ? `${remaining} ${remaining === 1 ? 'entry still' : 'entries still'} to add.`
                        : 'View current totals in the night.'}
                    </Text>
                    <PrimaryButton
                      label="Open night"
                      icon="arrow-up-outline"
                      variant="secondary"
                      onPress={() => router.push(`/night/${linked.nightId}`)}
                    />
                  </>
                ) : null}
                <PrimaryButton
                  label="Open session"
                  variant={linked ? 'quiet' : 'secondary'}
                  onPress={() =>
                    router.push({
                      pathname: '/quick-log',
                      params: { scope: scope === 'guest' ? 'guest' : 'account', sessionId: s.id },
                    })
                  }
                />
                <Disclosure title="Session options">
                  <PrimaryButton
                    label="Delete local session"
                    variant="quiet"
                    disabled={unresolvedQuickTransfers(state.record).some(
                      (o) => o.sessionId === s.id,
                    )}
                    onPress={() =>
                      void (async () => {
                        if (
                          s.entries.length &&
                          !(await confirmAction(
                            'Delete this session?',
                            scope !== 'guest'
                              ? 'This removes this device’s copy. Your account history is kept and may restore it when syncing.'
                              : s.entries.some((e) => e.destination)
                                ? 'This removes only this device’s copy. Entries already added to a night stay in that night.'
                                : 'This removes only this local session and its entries.',
                            'Delete session',
                            true,
                          ))
                        )
                          return;
                        try {
                          store.deleteSession(s.id);
                          setIssue(null);
                        } catch (e) {
                          setIssue(
                            e instanceof Error ? e.message : 'Couldn’t delete this session.',
                          );
                        }
                      })()
                    }
                  />
                </Disclosure>
              </Panel>
            );
          })
      ) : (
        <Notice message="No past quick sessions yet." />
      )}
      {issue || state.issue ? <Notice error message={issue ?? state.issue ?? ''} /> : null}
      {sync.issue ? (
        <Panel>
          <Notice message={sync.issue} />
          <PrimaryButton label="Retry account saving" variant="quiet" onPress={sync.retrySync} />
        </Panel>
      ) : null}
      <PrimaryButton
        label="Back to Quick Log"
        variant="quiet"
        onPress={() =>
          router.replace({
            pathname: '/quick-log',
            params: { scope: scope === 'guest' ? 'guest' : 'account' },
          })
        }
      />
    </Screen>
  );
}
