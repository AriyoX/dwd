import { RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getActiveNights } from '@dwd/data';
import { Brand } from '@/components/brand';
import { Action, PrimaryButton } from '@/components/primary-button';
import {
  LoadingPanel,
  Notice,
  Panel,
  RetryPanel,
  Screen,
  ScreenHeading,
} from '@/components/screen';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme } from '@/providers/theme-provider';
import { useAccountQuery } from '@/hooks/use-account-query';

export default function TonightScreen() {
  const router = useRouter();
  const { status } = useSupabase();
  const { colors, typography } = useTheme();
  const { data: nights, loading, issue, refresh } = useAccountQuery(getActiveNights);
  return (
    <Screen
      refreshControl={
        status === 'signed-in' ? (
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void refresh()}
            tintColor={colors.primary}
          />
        ) : undefined
      }
    >
      <Brand />
      <ScreenHeading title="Tonight" />
      {status === 'signed-in' ? (
        <Panel style={{ backgroundColor: colors.primarySoft }}>
          <PrimaryButton label="Start a night" onPress={() => router.push('/night/new')} />
          <PrimaryButton
            label="Join with an invite"
            variant="secondary"
            onPress={() => router.push('/join')}
          />
        </Panel>
      ) : status === 'loading' ? (
        <LoadingPanel />
      ) : (
        <Panel>
          <Notice
            message={
              status === 'unconfigured'
                ? 'Account connection unavailable.'
                : 'Sign in to start or join a night.'
            }
          />
          {status !== 'unconfigured' ? (
            <PrimaryButton label="Sign in" onPress={() => router.push('/account')} />
          ) : null}
        </Panel>
      )}
      {status === 'signed-in' ? (
        <View style={{ gap: 12 }}>
          <Text accessibilityRole="header" style={typography.sectionTitle}>
            Active nights
          </Text>
          {issue ? <RetryPanel issue={issue} retry={() => void refresh()} /> : null}
          {!nights && loading ? (
            <LoadingPanel />
          ) : nights?.length === 0 ? (
            <Panel style={{ alignItems: 'center', paddingVertical: 32 }}>
              <Ionicons name="moon-outline" size={32} color={colors.primary} accessible={false} />
              <Notice message="No active nights yet" />
            </Panel>
          ) : (
            nights?.map((night) => (
              <Action
                key={night.id}
                label={`Open ${night.title}`}
                onPress={() => router.push(`/night/${night.id}`)}
                style={{
                  padding: 20,
                  borderRadius: 22,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  flexDirection: 'row',
                  gap: 16,
                  alignItems: 'center',
                }}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 16,
                    backgroundColor: colors.primarySoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons
                    name="moon-outline"
                    size={23}
                    color={colors.primary}
                    accessible={false}
                  />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>
                    {night.role === 'host' ? 'Hosting' : 'Joined'}
                  </Text>
                  <Text
                    style={{ color: colors.text, fontSize: 19, lineHeight: 25, fontWeight: '600' }}
                  >
                    {night.title}
                  </Text>
                  <Text style={typography.body}>
                    Until{' '}
                    {new Date(night.endsAt).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.muted}
                  accessible={false}
                />
              </Action>
            ))
          )}
        </View>
      ) : null}
      <View style={{ marginTop: 'auto', paddingTop: 12 }}>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>
          DWD cannot determine sobriety or driving safety.
        </Text>
      </View>
    </Screen>
  );
}
