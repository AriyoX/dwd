import { RefreshControl, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { NightActivity } from '@/components/night-activity';
import { NightMetrics } from '@/components/night-metrics';
import { NightArtwork } from '@/components/night-artwork';
import { PrimaryButton } from '@/components/primary-button';
import {
  LoadingPanel,
  Notice,
  Panel,
  RetryPanel,
  Screen,
  ScreenHeading,
} from '@/components/screen';
import { useNight } from '@/hooks/use-night';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme } from '@/providers/theme-provider';
import { PendingLogs } from '@/components/pending-logs';

export default function SummaryScreen() {
  const { nightId } = useLocalSearchParams<{ nightId: string }>();
  const router = useRouter();
  const { status } = useSupabase();
  const { colors, typography } = useTheme();
  const { snapshot, issue, refresh, loading } = useNight(nightId, true);
  const member = snapshot?.members.find((m) => m.id === snapshot.currentMemberId);
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
      <PendingLogs
        key={`${nightId}:${snapshot?.currentUserId}`}
        nightId={nightId}
        snapshot={snapshot}
      />
      {status !== 'signed-in' ? (
        <Notice message="Sign in to view this recap." />
      ) : issue && !snapshot ? (
        <RetryPanel issue={issue} retry={() => void refresh()} />
      ) : !snapshot ? (
        <LoadingPanel />
      ) : (
        <>
          <ScreenHeading title={snapshot.night.title} />
          <Text style={typography.body}>
            {new Date(snapshot.night.startsAt).toLocaleDateString([], {
              dateStyle: 'long',
              timeZone: snapshot.night.timezone,
            })}
          </Text>
          {snapshot.historyScope === 'personal' ? (
            <Notice message="Your activity from this night" />
          ) : null}
          {member ? (
            <>
              <Panel>
                <NightArtwork compact />
                <Text accessibilityRole="header" style={typography.sectionTitle}>
                  Your recap
                </Text>
                <NightMetrics
                  drinks={member.drinkLogs.filter((log) => !log.deletedAt).length}
                  water={member.waterLogs.filter((log) => !log.deletedAt).length}
                />
              </Panel>
              <NightActivity member={member} timezone={snapshot.night.timezone} />
            </>
          ) : null}
          {snapshot.historyScope !== 'personal' ? (
            <Panel>
              <Text accessibilityRole="header" style={typography.sectionTitle}>
                People
              </Text>
              {snapshot.members.map((m) => (
                <View key={m.id} style={{ gap: 4 }}>
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
                    {m.displayName}
                  </Text>
                  <Text style={typography.body}>
                    {m.drinkLogs.filter((log) => !log.deletedAt).length} drinks ·{' '}
                    {m.waterLogs.filter((log) => !log.deletedAt).length} chasers
                  </Text>
                </View>
              ))}
            </Panel>
          ) : null}
          {issue ? <RetryPanel issue={issue} retry={() => void refresh()} /> : null}
          <PrimaryButton
            label="Back to history"
            variant="secondary"
            onPress={() => router.replace('/history')}
          />
        </>
      )}
    </Screen>
  );
}
