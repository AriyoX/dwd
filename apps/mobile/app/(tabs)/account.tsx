import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Brand } from '@/components/brand';
import { PrimaryButton } from '@/components/primary-button';
import { Panel, Screen, ScreenHeading } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { useSupabase } from '@/providers/supabase-provider';
import { colors, typography } from '@/theme/tokens';

export default function AccountScreen() {
  const { client, session, status, issue } = useSupabase();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [profileName, setProfileName] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!client || !session) {
      setProfileName(null);
      setProfileLoading(false);
      return;
    }

    let mounted = true;
    setProfileLoading(true);
    void client
      .from('profiles')
      .select('display_name')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (mounted) setProfileName(data?.display_name ?? null);
      })
      .catch(() => {
        if (mounted) setProfileName(null);
      })
      .finally(() => {
        if (mounted) setProfileLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [client, session]);

  async function signIn() {
    if (!client) return;
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setMessage('Sign in failed. Check your email and password.');
    } catch {
      setMessage('Could not sign in. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (!client) return;
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await client.auth.signOut();
      if (error) setMessage('Could not sign out. Try again.');
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
          <Text accessibilityRole="header" style={styles.panelTitle}>
            Your profile
          </Text>
          <View style={styles.avatar} accessible={false}>
            <Text style={styles.initial}>{(profileName || 'You').slice(0, 1).toUpperCase()}</Text>
          </View>
          {profileLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.panelTitle}>{profileName ?? 'Signed in'}</Text>
          )}
          <Text style={styles.body}>{session.user.email}</Text>
          {message ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {message}
            </Text>
          ) : null}
          <PrimaryButton
            busy={busy}
            label="Sign out"
            variant="secondary"
            onPress={() => void signOut()}
          />
        </Panel>
      ) : (
        <Panel>
          <TextField
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            label="Email"
            onChangeText={setEmail}
            textContentType="emailAddress"
            value={email}
          />
          <TextField
            autoCapitalize="none"
            autoCorrect={false}
            label="Password"
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            value={password}
          />
          {issue || message ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {message ?? issue}
            </Text>
          ) : null}
          <PrimaryButton
            busy={busy}
            disabled={!email.trim() || !password}
            label="Sign in"
            onPress={() => void signIn()}
          />
        </Panel>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
