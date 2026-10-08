import { useCallback, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dwd/core';
import { useAccountQuery } from '@/hooks/use-account-query';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SettingsSection } from '@/components/settings-section';
import { PrimaryButton } from '@/components/primary-button';
import { Panel, ScreenHeading } from '@/components/screen';
import { TourScreen, TourTarget } from '@/components/tour-screen';
import { authHandoff } from '@/lib/auth-state';
import { AppearancePicker } from '@/components/appearance-picker';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme, useThemedStyles } from '@/providers/theme-provider';
import type { ThemeColors, makeTypography } from '@/theme/tokens';
import { NavigationRow } from '@/components/navigation-row';
import { useNotifications } from '@/providers/notifications-provider';

export default function AccountScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { client, session, status, issue, profileStatus, refreshProfile } = useSupabase();
  const userId = session?.user.id;
  const notifications = useNotifications();
  const loadProfile = useCallback(
    async (connection: SupabaseClient<Database>) => {
      const { data, error } = await connection
        .from('profiles')
        .select('display_name')
        .eq('id', userId ?? '')
        .maybeSingle();
      if (error) throw error;
      return data?.display_name ?? null;
    },
    [userId],
  );
  const { data: profileName, loading: profileLoading } = useAccountQuery(
    loadProfile,
    'profile-name',
    false,
    false,
    undefined,
    5 * 60_000,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function signOut() {
    if (!client) return;
    setBusy(true);
    setMessage(null);
    try {
      await notifications.deactivate();
      const { error } = await client.auth.signOut();
      if (error) setMessage('Could not sign out. Try again.');
      else authHandoff().clear();
    } catch {
      setMessage("Couldn't sign out. Try again when you're online.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <TourScreen route="/account">
      <ScreenHeading
        title={
          session
            ? 'Settings'
            : status === 'signed-out' || status === 'error'
              ? 'Welcome back'
              : 'Settings'
        }
      />

      {status === 'unconfigured' ? (
        <Panel>
          <Text style={styles.body}>DWD is unavailable. Try again.</Text>
        </Panel>
      ) : status === 'loading' ? (
        <Panel style={styles.loadingPanel}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.body}>Signing in…</Text>
        </Panel>
      ) : session ? (
        <Panel>
          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
            <View style={styles.avatar} accessible={false}>
              <Text style={styles.initial}>{(profileName || 'You').slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              {profileLoading && profileName === null ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.panelTitle}>{profileName ?? 'Signed in'}</Text>
              )}
              <Text style={styles.body}>{session.user.email}</Text>
            </View>
          </View>
          {message ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {message}
            </Text>
          ) : null}
          {profileStatus === 'error' ? (
            <>
              <Text accessibilityRole="alert" style={styles.error}>
                Could not load your account.
              </Text>
              <PrimaryButton label="Try again" variant="secondary" onPress={refreshProfile} />
            </>
          ) : null}
          <NavigationRow
            label="Edit profile"
            icon="person-outline"
            onPress={() => router.push('/profile')}
          />
        </Panel>
      ) : (
        <Panel>
          {issue || message ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {message ?? issue}
            </Text>
          ) : null}
          <PrimaryButton label="Sign in" onPress={() => router.push('/auth/sign-in')} />
          <PrimaryButton
            label="Create account"
            variant="secondary"
            onPress={() => router.push('/auth/sign-up')}
          />
        </Panel>
      )}
      {session ? (
        <SettingsSection title="Your nights">
          <NavigationRow
            label="Notifications"
            icon="notifications-outline"
            onPress={() => router.push('/notifications')}
          />
          <TourTarget id="reminders">
            <NavigationRow
              label="Night reminders"
              icon="time-outline"
              onPress={() => router.push('/reminders')}
            />
          </TourTarget>
        </SettingsSection>
      ) : null}
      <TourTarget id="settings">
        <SettingsSection title="Appearance">
          <AppearancePicker />
        </SettingsSection>
      </TourTarget>
      <SettingsSection title="Help & privacy">
        {session ? (
          <NavigationRow
            label="Support & feedback"
            icon="chatbubble-outline"
            onPress={() => router.push('/support')}
          />
        ) : null}
        {session ? (
          <NavigationRow
            label="Explore DWD"
            icon="compass-outline"
            onPress={() => router.push('/tour?replay=1')}
          />
        ) : null}
        <NavigationRow
          label="Local help numbers"
          icon="call-outline"
          onPress={() => router.push('/local-help')}
        />
        <NavigationRow
          label="Privacy"
          tone="neutral"
          icon="shield-checkmark-outline"
          onPress={() => router.push('/legal?document=privacy')}
        />
        <NavigationRow
          label="Terms"
          tone="neutral"
          icon="document-text-outline"
          onPress={() => router.push('/legal?document=terms')}
        />
        {session ? (
          <NavigationRow
            label="Blocked people"
            icon="person-remove-outline"
            onPress={() => router.push('/blocked-people')}
          />
        ) : null}
      </SettingsSection>
      {session ? (
        <SettingsSection title="Account options">
          <NavigationRow
            busy={busy}
            busyLabel="Signing out"
            label="Sign out"
            icon="log-out-outline"
            showChevron={false}
            onPress={() => void signOut()}
          />
          <NavigationRow
            label="Delete account"
            tone="danger"
            icon="trash-outline"
            onPress={() => router.push('/delete-account')}
          />
        </SettingsSection>
      ) : null}
    </TourScreen>
  );
}

const createStyles = (colors: ThemeColors, typography: ReturnType<typeof makeTypography>) =>
  StyleSheet.create({
    panelTitle: { ...typography.sectionTitle, fontSize: 20 },
    avatar: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 20,
      backgroundColor: colors.surfaceSoft,
      borderWidth: 1,
      borderColor: colors.border,
    },
    initial: { color: colors.muted, fontSize: 26, fontWeight: '600' },
    body: { ...typography.body, flexShrink: 1 },
    loadingPanel: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    error: { color: colors.error, fontSize: 14, lineHeight: 20 },
  });
