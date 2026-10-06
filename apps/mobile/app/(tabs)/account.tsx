import { useCallback, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dwd/core';
import { useAccountQuery } from '@/hooks/use-account-query';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Brand } from '@/components/brand';
import { PrimaryButton } from '@/components/primary-button';
import { Panel, Screen, ScreenHeading } from '@/components/screen';
import { authHandoff } from '@/lib/auth-state';
import { AppearancePicker } from '@/components/appearance-picker';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme, useThemedStyles } from '@/providers/theme-provider';
import type { ThemeColors, makeTypography } from '@/theme/tokens';
import { NavigationRow } from '@/components/navigation-row';
import { useNotifications } from '@/providers/notifications-provider';
import { BlockedUsers } from '@/components/blocked-users';
import { CampaignCountrySettings } from '@/components/campaign-country-settings';

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
  const { data: profileName, loading: profileLoading } = useAccountQuery(loadProfile);
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
      setMessage('Could not sign out. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Brand />
      <ScreenHeading
        title={
          session
            ? 'Your account'
            : status === 'signed-out' || status === 'error'
              ? 'Welcome back'
              : 'Your account'
        }
      />

      {status === 'unconfigured' ? (
        <Panel>
          <Text style={styles.body}>Account connection unavailable.</Text>
        </Panel>
      ) : status === 'loading' ? (
        <Panel style={styles.loadingPanel}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.body}>Restoring session</Text>
        </Panel>
      ) : session ? (
        <Panel>
          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
            <View style={styles.avatar} accessible={false}>
              <Text style={styles.initial}>{(profileName || 'You').slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              {profileLoading ? (
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
              <PrimaryButton label="Retry" variant="secondary" onPress={refreshProfile} />
            </>
          ) : null}
          <PrimaryButton
            busy={busy}
            busyLabel="Signing out"
            label="Sign out"
            variant="quiet"
            onPress={() => void signOut()}
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
      <CampaignCountrySettings />
      <Panel>
        {session ? (
          <NavigationRow
            label="Practice tour"
            icon="compass-outline"
            onPress={() => router.push('/tour?replay=1')}
          />
        ) : null}
        {session ? (
          <NavigationRow
            label="Notifications"
            icon="notifications-outline"
            onPress={() => router.push('/notifications')}
          />
        ) : null}
        {session ? (
          <NavigationRow
            label="Edit profile"
            icon="person-outline"
            onPress={() => router.push('/profile')}
          />
        ) : null}
        {session ? (
          <NavigationRow
            label="Support & feedback"
            icon="chatbubble-outline"
            onPress={() => router.push('/support')}
          />
        ) : null}
        <Text accessibilityRole="header" style={styles.panelTitle}>
          Appearance
        </Text>
        <AppearancePicker />
      </Panel>
      <Panel>
        <PrimaryButton
          label="Terms"
          variant="quiet"
          onPress={() => router.push('/legal?document=terms')}
        />
        <PrimaryButton
          label="Privacy"
          variant="quiet"
          onPress={() => router.push('/legal?document=privacy')}
        />
        {session ? (
          <NavigationRow
            label="Delete account"
            icon="trash-outline"
            onPress={() => router.push('/delete-account')}
          />
        ) : null}
      </Panel>
      {session ? <BlockedUsers key={session.user.id} /> : null}
    </Screen>
  );
}

const createStyles = (colors: ThemeColors, typography: ReturnType<typeof makeTypography>) =>
  StyleSheet.create({
    panelTitle: typography.sectionTitle,
    avatar: {
      width: 62,
      height: 62,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 20,
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.border,
    },
    initial: { color: colors.primary, fontSize: 26, fontWeight: '600' },
    body: { ...typography.body, flexShrink: 1 },
    loadingPanel: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  });
