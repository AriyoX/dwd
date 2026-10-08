import { RefreshControl, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { NightActivity } from '@/components/night-activity';
import { RecapMembers, RecapTimeline } from '@/components/recap-details';
import { NavigationRow } from '@/components/navigation-row';
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
import { useOffline } from '@/providers/offline-provider';

export default function SummaryScreen() {
  const { nightId } = useLocalSearchParams<{ nightId: string }>();
  const router = useRouter();
  const { status } = useSupabase();
  const { records } = useOffline();
  const { colors, typography } = useTheme();
  const { snapshot, issue, refresh, refreshing, cached } = useNight(nightId, true);
  const member = snapshot?.members.find((m) => m.id === snapshot.currentMemberId);
  return (
    <Screen
      insetTop={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh(true)}
          tintColor={colors.primary}
        />
      }
    >
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
                <NavigationRow
                  label="Photo memories"
                  icon="images-outline"
                  onPress={() => router.push(`/night/${nightId}/photos`)}
                />
              </Panel>
              <RecapTimeline snapshot={snapshot} />
              <RecapMembers snapshot={snapshot} />
              <NightActivity
                key={`${nightId}:${member.id}`}
                member={member}
                snapshot={snapshot}
                nightId={nightId}
                timezone={snapshot.night.timezone}
              />
            </>
          ) : null}
          {issue ? (
            cached ? (
              <Notice message={issue} />
            ) : (
              <RetryPanel issue={issue} retry={() => void refresh()} />
            )
          ) : null}
          <PrimaryButton
            label="Back to entries"
            variant="secondary"
            onPress={() => router.replace('/history')}
          />
        </>
      )}
      {!snapshot &&
      status === 'signed-in' &&
      records.some((record) => record.nightId === nightId) ? (
        <NightActivity nightId={nightId} timezone="UTC" />
      ) : null}
    </Screen>
  );
}
