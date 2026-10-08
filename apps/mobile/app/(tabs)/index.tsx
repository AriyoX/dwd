import { RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getActiveNights } from '@dwd/data';
import { TourScreen, TourTarget } from '@/components/tour-screen';
import { NavigationRow } from '@/components/navigation-row';
import { Brand } from '@/components/brand';
import { NightArtwork } from '@/components/night-artwork';
import { Action, PrimaryButton } from '@/components/primary-button';
import { LoadingPanel, Notice, Panel, RetryPanel, ScreenHeading } from '@/components/screen';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme } from '@/providers/theme-provider';
import { useAccountQuery } from '@/hooks/use-account-query';

export default function TonightScreen() {
  const router = useRouter();
  const { status } = useSupabase();
  const { colors, typography } = useTheme();
  const {
    data: nights,
    loading,
    refreshing,
    issue,
    refresh,
    cached,
  } = useAccountQuery(getActiveNights, 'active-nights', true);
  return (
    <TourScreen
      route="/"
      refreshControl={
        status === 'signed-in' ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh(true)}
            tintColor={colors.primary}
          />
        ) : undefined
      }
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <Brand />
        <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '500', flexShrink: 1 }}>
          {new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
        </Text>
      </View>
      <ScreenHeading title="Tonight" />
      {status === 'signed-in' ? (
        <View style={{ gap: 12 }}>
          <Text accessibilityRole="header" style={typography.sectionTitle}>
            Active nights
          </Text>
          {issue ? (
            cached ? (
              <Notice message={issue} />
            ) : (
              <RetryPanel issue={issue} retry={() => void refresh()} />
            )
          ) : null}
          {!nights && loading ? (
            <LoadingPanel />
          ) : nights?.length === 0 ? (
            <View
              style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 12 }}
            >
              <Ionicons name="moon-outline" size={22} color={colors.muted} accessible={false} />
              <Notice message="No active nights yet" />
            </View>
          ) : (
            nights?.map((night) => (
              <Action
                key={night.id}
                label={`Open ${night.title} to log a drink`}
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
                  <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>
                    Open night
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
      {status === 'signed-in' ? (
        <View style={{ gap: 14 }}>
          {nights?.length ? (
            <TourTarget id="start">
              <PrimaryButton
                label="Start another night"
                icon="add"
                variant="secondary"
                onPress={() => router.push('/night/new')}
              />
            </TourTarget>
          ) : (
            <Panel
              style={{ backgroundColor: colors.surface, padding: 24, gap: 8, overflow: 'hidden' }}
            >
              <Text
                accessibilityRole="header"
                style={{
                  color: colors.text,
                  fontSize: 28,
                  lineHeight: 33,
                  letterSpacing: -0.8,
                  fontWeight: '600',
                }}
              >
                Ready for tonight?
              </Text>
              <NightArtwork compact={Boolean(nights?.length)} />
              <TourTarget id="start">
                <PrimaryButton
                  label="Start a night"
                  icon="add"
                  onPress={() => router.push('/night/new')}
                />
              </TourTarget>
            </Panel>
          )}
          <TourTarget id="join">
            <Action
              label="Join with an invite"
              onPress={() => router.push('/join')}
              style={{
                flexDirection: 'row',
                gap: 14,
                alignItems: 'center',
                padding: 18,
                borderRadius: 22,
                backgroundColor: colors.primarySoft,
              }}
            >
              <Ionicons name="people-outline" size={24} color={colors.primary} accessible={false} />
              <Text style={{ flex: 1, color: colors.primary, fontSize: 17, fontWeight: '600' }}>
                Join with an invite
              </Text>
              <Ionicons name="arrow-forward" size={20} color={colors.primary} accessible={false} />
            </Action>
          </TourTarget>
          {/* <Panel style={{ paddingVertical: 4, gap: 0 }}>
            <NavigationRow
              label="Notifications"
              icon="notifications-outline"
              onPress={() => router.push('/notifications')}
            />
            <NavigationRow
              label="Entries & memories"
              icon="time-outline"
              onPress={() => router.push('/history')}
            />
            <NavigationRow
              label="Settings"
              icon="settings-outline"
              onPress={() => router.push('/account')}
            />
          </Panel> */}
        </View>
      ) : status === 'loading' ? (
        <LoadingPanel />
      ) : (
        <Panel>
          <NightArtwork compact={Boolean(nights?.length)} />
          <Notice
            message={
              status === 'unconfigured'
                ? 'DWD is unavailable. Try again.'
                : 'Sign in to start or join a night.'
            }
          />
          {status !== 'unconfigured' ? (
            <PrimaryButton label="Sign in" onPress={() => router.push('/account')} />
          ) : null}
        </Panel>
      )}
      <View style={{ marginTop: 'auto', paddingTop: 12 }}>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>
          DWD cannot determine sobriety or driving safety.
        </Text>
      </View>
    </TourScreen>
  );
}
