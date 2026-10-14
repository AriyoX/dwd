import { Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { quickAccountBenefits } from '@dwd/core';
import { PrimaryButton } from '@/components/primary-button';
import { Screen, Panel, ScreenHeading } from '@/components/screen';
import { authHandoff, safeDestination } from '@/lib/auth-state';
import { useTheme } from '@/providers/theme-provider';
import { useState } from 'react';
import { Notice } from '@/components/screen';
export default function QuickBenefitsScreen() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const destination = safeDestination(next ?? '/quick-log?scope=account');
  const { typography } = useTheme();
  const [issue, setIssue] = useState<string | null>(null);
  function signIn(create: boolean) {
    try {
      authHandoff().remember(destination);
      router.replace(create ? '/auth/sign-up' : '/auth/sign-in');
    } catch {
      setIssue('Couldn’t save your return path. Keep logging and try again.');
    }
  }
  return (
    <Screen insetTop={false} hidePermissionReminder sheetTitle="More of your night.">
      <ScreenHeading title="Save your nights" />
      <Text style={typography.body}>Save your Quick Log and night history to your account.</Text>
      <Panel>
        {quickAccountBenefits.map((benefit) => (
          <Text key={benefit} style={typography.body}>
            {benefit}
          </Text>
        ))}
      </Panel>
      <PrimaryButton label="Sign in" onPress={() => signIn(false)} />
      <PrimaryButton label="Create account" variant="secondary" onPress={() => signIn(true)} />
      <PrimaryButton
        label="Keep logging as a guest"
        variant="quiet"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/quick-log'))}
      />
      {issue ? <Notice error message={issue} /> : null}
    </Screen>
  );
}
