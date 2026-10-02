import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AuthFlowError, exchangeAuthCallbackOnce } from '@/lib/auth-actions';
import { authHandoff } from '@/lib/auth-state';
import { LoadingPanel, Notice, Panel, Screen } from '@/components/screen';
import { PrimaryButton } from '@/components/primary-button';
import { useSupabase } from '@/providers/supabase-provider';

export default function AuthCallbackScreen() {
  const values = useLocalSearchParams<Record<string, string | string[]>>();
  const query = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values))
      if (typeof value === 'string') params.set(key, value);
    params.sort();
    return params.toString();
  }, [values]);
  return <AuthCallbackAttempt key={query} query={query} />;
}

// A new incoming link gets fresh loading/error state, including while this route is open.
function AuthCallbackAttempt({ query }: { query: string }) {
  const recovery =
    new URLSearchParams(query).get('flow') === 'recovery' ||
    new URLSearchParams(query).get('type') === 'recovery';
  const { client, markRecovery, refreshProfile } = useSupabase();
  const router = useRouter();
  const [issue, setIssue] = useState<string | null>(null);
  useEffect(() => {
    if (!client) return;
    let current = true;
    const next = new URLSearchParams(query).get('next');
    if (next) authHandoff().remember(next);
    void exchangeAuthCallbackOnce(client, new URLSearchParams(query)).then(
      (result) => {
        if (!current) return;
        if (result.recovery) markRecovery(result.userId);
        refreshProfile();
        router.replace(result.recovery ? '/auth/reset-password' : '/welcome');
      },
      (error: unknown) => {
        if (current) {
          setIssue(
            error instanceof AuthFlowError
              ? error.message
              : 'Could not confirm your account. Request a new email or sign in.',
          );
        }
      },
    );
    return () => {
      current = false;
    };
  }, [client, query, markRecovery, refreshProfile, router]);
  return (
    <Screen insetTop={false}>
      {issue || !client ? (
        <Panel>
          <Notice error message={issue ?? 'Account connection unavailable.'} />
          <PrimaryButton
            label={recovery ? 'Request a new reset link' : 'Confirmation help'}
            onPress={() => router.replace(recovery ? '/auth/forgot-password' : '/auth/confirm')}
          />
          <PrimaryButton
            label="Sign in"
            variant="quiet"
            onPress={() => router.replace('/auth/sign-in')}
          />
        </Panel>
      ) : (
        <LoadingPanel />
      )}
    </Screen>
  );
}
