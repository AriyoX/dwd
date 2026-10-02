import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { InvitationPreview } from '@dwd/core';
import { getInvitePreview, redeemNightInvite } from '@dwd/data';
import { PrimaryButton } from '@/components/primary-button';
import { Notice, Panel, Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { hashInvite, parseInvite } from '@/lib/invites';
import { authHandoff } from '@/lib/auth-state';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme } from '@/providers/theme-provider';

export default function JoinScreen() {
  const { token: linkedToken } = useLocalSearchParams<{ token?: string }>();
  const { session } = useSupabase();
  return (
    <JoinForm
      key={`${session?.user.id ?? 'anonymous'}:${linkedToken ?? ''}`}
      linkedToken={linkedToken}
    />
  );
}

function JoinForm({ linkedToken }: { linkedToken: string | undefined }) {
  const router = useRouter();
  const { client, status } = useSupabase();
  const { typography } = useTheme();
  const [input, setInput] = useState(() =>
    linkedToken && parseInvite(linkedToken) ? linkedToken : '',
  );
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const tokenHash = useRef<string | null>(null);
  const version = useRef(0);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    const token = linkedToken && parseInvite(linkedToken);
    if (token && status !== 'signed-in') authHandoff().remember(`/join?token=${token}`);
  }, [linkedToken, status]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function review() {
    if (!client || inFlight.current) return;
    const token = parseInvite(input);
    if (!token) {
      setIssue('Paste a valid DWD invite link or code.');
      return;
    }
    const request = version.current;
    inFlight.current = true;
    setBusy(true);
    setIssue(null);
    try {
      const hash = await hashInvite(token);
      const result = await getInvitePreview(client, hash);
      if (!mounted.current || version.current !== request) return;
      tokenHash.current = hash;
      setPreview(result);
      if (!result.valid) setIssue('This invite is unavailable or the night has ended.');
    } catch {
      if (mounted.current && version.current === request)
        setIssue('Could not check this invite. Retry.');
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function join() {
    if (!client || !tokenHash.current || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setIssue(null);
    const request = version.current;
    try {
      const result = await redeemNightInvite(client, tokenHash.current);
      if (!mounted.current || version.current !== request) return;
      authHandoff().clear();
      router.replace(
        result.needsPlan ? `/night/${result.nightId}/plan` : `/night/${result.nightId}`,
      );
    } catch {
      if (!mounted.current || version.current !== request) return;
      setIssue(
        'Could not join. The invite may have expired. Retry or ask the host for a new link.',
      );
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <Screen insetTop={false}>
      <Panel>
        <TextField
          label="Invite link or code"
          value={input}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={500}
          onChangeText={(value) => {
            version.current++;
            tokenHash.current = null;
            setInput(value);
            setPreview(null);
            setIssue(null);
          }}
        />
      </Panel>
      {status !== 'signed-in' ? (
        <Panel>
          <Notice message="Sign in to join a night." />
          <PrimaryButton
            label="Sign in"
            onPress={() => {
              const token = parseInvite(input);
              if (token) authHandoff().remember(`/join?token=${token}`);
              router.push('/auth/sign-in');
            }}
          />
        </Panel>
      ) : (
        <Panel>
          {preview?.valid ? (
            <>
              <Text accessibilityRole="header" style={typography.sectionTitle}>
                {preview.nightTitle}
              </Text>
              <Text style={typography.body}>
                Hosted by {preview.hostDisplayName} · Until{' '}
                {new Date(preview.endsAt).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                  timeZone: preview.timezone,
                })}
              </Text>
              <PrimaryButton label="Join night" busy={busy} onPress={() => void join()} />
            </>
          ) : (
            <PrimaryButton
              label="Check invite"
              busy={busy}
              disabled={!input.trim()}
              onPress={() => void review()}
            />
          )}
          {issue ? <Notice error message={issue} /> : null}
        </Panel>
      )}
    </Screen>
  );
}
