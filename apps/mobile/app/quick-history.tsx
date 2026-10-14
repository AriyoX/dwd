import { useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { quickCountLabel, unresolvedQuickTransfers } from '@dwd/core';
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
  return (
    <Screen insetTop={false} hidePermissionReminder>
      <ScreenHeading title="Past quick sessions" />
      {state.record.sessions.length ? (
        [...state.record.sessions].reverse().map((s) => (
          <Panel key={s.id}>
            <Text style={typography.sectionTitle}>{quickCountLabel(s.entries)}</Text>
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
                      s.entries.some((e) => e.destination)
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
