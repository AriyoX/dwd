import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { blockUser, reportContent } from '@dwd/data';
import { LEGAL_CONTACT } from '@dwd/core';
import { useNight } from '@/hooks/use-night';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme } from '@/providers/theme-provider';
import { actorClient } from '@/lib/actor-client';
import { withRequestTimeout } from '@/lib/request-timeout';
import { confirmAction } from '@/lib/confirm';
import { TextField } from '@/components/text-field';
import { PrimaryButton } from '@/components/primary-button';
import { Choice } from '@/components/choice';
import { Notice, Panel, Screen, ScreenHeading } from '@/components/screen';

export default function ReportScreen() {
  const { session } = useSupabase();
  return <ReportForm key={session?.user.id} />;
}

function ReportForm() {
  const { nightId, photoId, userId } = useLocalSearchParams<{
    nightId: string;
    photoId?: string;
    userId?: string;
  }>();
  const { snapshot } = useNight(nightId);
  const { client, session } = useSupabase();
  const { typography } = useTheme();
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [locked, setLocked] = useState(false);
  const alive = useRef(true);
  const stillMounted = () => alive.current;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const attempt = useRef<{
    nightId: string;
    memberId: string | null;
    photoId: string | null;
    reason: string;
    requestKey: string;
  } | null>(null);
  const saving = useRef(false);
  const member = snapshot?.members.find((entry) => entry.id === selected);
  async function submit(block: boolean) {
    if (!client || !session || saving.current) return;
    const target = userId ?? member?.userId;
    if (
      block &&
      (!target ||
        !(await confirmAction(
          'Block this person?',
          'You will stop sharing active nights. If you host, this person is removed; otherwise you leave shared active nights. You can unblock them in Account.',
          'Block person',
          true,
        )))
    )
      return;
    if (!stillMounted()) return;
    saving.current = true;
    setBusy(true);
    setIssue(null);
    try {
      const connection = actorClient(client, session.access_token);
      if (block && target) {
        await withRequestTimeout(() => blockUser(connection, target));
        if (stillMounted()) router.replace('/');
      } else {
        const payload = attempt.current ?? {
          nightId,
          memberId: selected,
          photoId: photoId ?? null,
          reason,
          requestKey: Crypto.randomUUID(),
        };
        attempt.current = payload;
        setLocked(true);
        await withRequestTimeout(() => reportContent(connection, payload));
        if (stillMounted()) setSent(true);
      }
    } catch {
      if (stillMounted()) setIssue("Couldn't save this. Try again when you're online.");
    } finally {
      saving.current = false;
      if (stillMounted()) setBusy(false);
    }
  }
  return (
    <Screen insetTop={false}>
      <ScreenHeading title="Report or block" />
      <Notice message="Report harmful content for operator review. For urgent danger, contact emergency services. Blocking prevents sharing active nights." />
      {!photoId ? (
        <Panel>
          <Text style={typography.sectionTitle}>Content or person</Text>
          <Choice
            label="The night or other content"
            selected={selected === null}
            disabled={busy || locked}
            onPress={() => setSelected(null)}
          />
          {snapshot?.members
            .filter((entry) => entry.userId !== session?.user.id)
            .map((entry) => (
              <Choice
                key={entry.id}
                label={entry.displayName}
                selected={selected === entry.id}
                disabled={busy || locked}
                onPress={() => setSelected(entry.id)}
              />
            ))}
        </Panel>
      ) : null}
      {sent ? (
        <Notice message="Report sent. Open Your messages in Settings for replies." />
      ) : (
        <>
          <TextField
            label="What happened?"
            value={reason}
            onChangeText={setReason}
            maxLength={2000}
            multiline
            editable={!busy && !locked}
          />
          <PrimaryButton
            label="Send report"
            busy={busy}
            disabled={reason.trim().length < 10}
            onPress={() => void submit(false)}
          />
        </>
      )}
      {(userId ?? member?.userId) ? (
        <PrimaryButton
          label="Block person"
          variant="danger"
          busy={busy}
          onPress={() => void submit(true)}
        />
      ) : null}
      <Text style={typography.body}>Support: {LEGAL_CONTACT.email}</Text>
      {issue ? <Notice error message={issue} /> : null}
    </Screen>
  );
}
