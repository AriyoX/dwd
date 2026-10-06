import { ActivityIndicator, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthHeader, LegalLinks } from '@/components/auth-chrome';
import { NightArtwork } from '@/components/night-artwork';
import { PrimaryButton } from '@/components/primary-button';
import { Notice, Screen } from '@/components/screen';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme } from '@/providers/theme-provider';

export default function WelcomeScreen() {
  const { access, issue } = useSupabase();
  const { colors, typography } = useTheme();
  const router = useRouter();
  return (
    <Screen contentStyle={{ gap: 32, paddingBottom: 24 }}>
      <AuthHeader />
      {access !== 'signed-out' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <ActivityIndicator color={colors.primary} accessibilityLabel="Restoring your account" />
          <Text style={typography.body}>Opening your account…</Text>
        </View>
      ) : (
        <>
          <View style={{ marginTop: 'auto', gap: 28 }}>
            <NightArtwork />
            <Text
              accessibilityRole="header"
              style={{ ...typography.heading, fontSize: 44, lineHeight: 49 }}
            >
              Your night.{'\n'}Your pace.
            </Text>
          </View>
          {issue ? <Notice error message={issue} /> : null}
          <View style={{ marginTop: 'auto', gap: 12 }}>
            <PrimaryButton label="Create account" onPress={() => router.push('/auth/sign-up')} />
            <PrimaryButton
              label="Sign in"
              variant="secondary"
              onPress={() => router.push('/auth/sign-in')}
            />
          </View>
          <LegalLinks />
        </>
      )}
    </Screen>
  );
}
