import { useRef, useState } from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import type { InvitationPreview } from '@dwd/core';
import { getInvitePreview, redeemNightInvite } from '@dwd/data';
import { PrimaryButton } from '@/components/primary-button';
import { Notice, Panel, Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { hashInvite, parseInvite } from '@/lib/invites';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme } from '@/providers/theme-provider';

export default function JoinScreen() {
  const router = useRouter();
  const { client, status } = useSupabase();
  const { typography } = useTheme();
  const [input, setInput] = useState('');
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const tokenHash = useRef<string | null>(null);
  const version = useRef(0);
  const inFlight = useRef(false);
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
      if (version.current !== request) return;
      tokenHash.current = hash;
      setPreview(result);
      if (!result.valid) setIssue('This invite is unavailable or the night has ended.');
    } catch {
      if (version.current === request) setIssue('Could not check this invite. Retry.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function join() {
    if (!client || !tokenHash.current || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setIssue(null);
    try {
      const result = await redeemNightInvite(client, tokenHash.current);
      router.replace(
        result.needsPlan ? `/night/${result.nightId}/plan` : `/night/${result.nightId}`,
      );
    } catch {
      setIssue(
        'Could not join. The invite may have expired. Retry or ask the host for a new link.',
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <Screen insetTop={false}>
      {status !== 'signed-in' ? (
        <Panel>
          <Notice message="Sign in to join a night." />
          <PrimaryButton label="Sign in" onPress={() => router.replace('/account')} />
        </Panel>
      ) : (
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
