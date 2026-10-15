import { useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { availableQuickEntries, quickCountLabel, unresolvedQuickTransfers } from '@dwd/core';
import { useQuickSync } from '@/providers/quick-sync-provider';
import { useQuickLog } from '@/hooks/use-quick-log';
import { PrimaryButton } from '@/components/primary-button';
import { Notice, Panel, Screen, ScreenHeading } from '@/components/screen';
import { useTheme } from '@/providers/theme-provider';
import { confirmAction } from '@/lib/confirm';

export default function QuickHistoryScreen() {
  const { scope: param } = useLocalSearchParams<{ scope?: string }>();
  const { store, state, scope } = useQuickLog(param === 'guest');
  const { typography } = useTheme();
  const router = useRouter();
  const [issue, setIssue] = useState<string | null>(null);
  const sync = useQuickSync();
  const sessions = state.record.sessions.filter(
    (s) => (scope !== 'guest' || !s.claimedBy) && availableQuickEntries(s).length,
  );
  return (
    <Screen insetTop={false} hidePermissionReminder>
      <ScreenHeading title="Past quick sessions" />
      {sessions.length ? (
        [...sessions]
          .sort(
            (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id),
          )
          .map((s) => (
            <Panel key={s.id}>
              <Text style={typography.body}>Quick Log session</Text>
              <Text style={typography.sectionTitle}>
                {quickCountLabel(availableQuickEntries(s))}
              </Text>
              {availableQuickEntries(s).some((e) => e.kind === 'shot') ? (
                <Text style={typography.body}>
                  Includes {availableQuickEntries(s).filter((e) => e.kind === 'shot').length} shots.
                </Text>
              ) : null}
              <Text style={typography.body}>Drink sizes and alcohol strength not recorded.</Text>
              <Text style={typography.body}>
                {new Date(s.createdAt).toLocaleString()} ·{' '}
                {s.state === 'active' ? 'In progress' : 'Finished'}
              </Text>
              <PrimaryButton
                label="Open session"
                variant="secondary"
                onPress={() =>
                  router.push({
                    pathname: '/quick-log',
                    params: { scope: scope === 'guest' ? 'guest' : 'account', sessionId: s.id },
                  })
                }
              />
              <PrimaryButton
                label="Delete local session"
                variant="quiet"
                disabled={unresolvedQuickTransfers(state.record).some((o) => o.sessionId === s.id)}
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
                      setIssue(e instanceof Error ? e.message : 'Couldn’t delete this session.');
                    }
                  })()
                }
              />
            </Panel>
          ))
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
