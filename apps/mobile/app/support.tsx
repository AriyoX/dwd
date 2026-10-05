import { useEffect, useRef, useState } from 'react';
import { RefreshControl, Text } from 'react-native';
import * as Crypto from 'expo-crypto';
import {
  DataAccessError,
  getSupportRequests,
  submitSupportRequest,
  supportRequestSchema,
} from '@dwd/data';
import { Choice } from '@/components/choice';
import { PrimaryButton } from '@/components/primary-button';
import {
  LoadingPanel,
  Notice,
  Panel,
  RetryPanel,
  Screen,
  ScreenHeading,
} from '@/components/screen';
import { TextField } from '@/components/text-field';
import { useAccountQuery } from '@/hooks/use-account-query';
import { actorClient } from '@/lib/actor-client';
import { readSupportDraft, supportDraftKey, type SupportDraft } from '@/lib/support-draft';
import { withRequestTimeout } from '@/lib/request-timeout';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme } from '@/providers/theme-provider';

export default function SupportScreen() {
  const { session } = useSupabase();
  return session ? <Support key={session.user.id} owner={session.user.id} /> : null;
}
function Support({ owner }: { owner: string }) {
  const { client, session } = useSupabase();
  const query = useAccountQuery(getSupportRequests);
  const { colors, typography } = useTheme();
  const [draft, setDraft] = useState<SupportDraft>({
    owner,
    kind: 'problem',
    message: '',
    attempt: null,
  });
  const [ready, setReady] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        setDraft(readSupportDraft(globalThis.localStorage, owner));
      } catch {
        setStorageBlocked(true);
        setIssue('Could not restore your message. The saved draft has been kept.');
      }
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [owner]);
  useEffect(() => {
    if (!ready || storageBlocked) return;
    try {
      globalThis.localStorage.setItem(supportDraftKey(owner), JSON.stringify(draft));
    } catch {
      queueMicrotask(() =>
        setIssue('Could not save this message on the device. Keep this screen open.'),
      );
    }
  }, [ready, draft, owner, storageBlocked]);
  async function send() {
    if (!client || !session || inFlight.current || storageBlocked) return;
    const parsed = supportRequestSchema.safeParse(
      draft.attempt ?? {
        requestKey: Crypto.randomUUID(),
        kind: draft.kind,
        message: draft.message,
      },
    );
    if (!parsed.success) {
      setIssue(parsed.error.issues[0]?.message ?? 'Check your message.');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setIssue(null);
    setNotice(null);
    try {
      const next = { ...draft, attempt: parsed.data };
      globalThis.localStorage.setItem(supportDraftKey(owner), JSON.stringify(next));
      setDraft(next);
      await withRequestTimeout((signal) =>
        submitSupportRequest(actorClient(client, session.access_token, signal), parsed.data),
      );
      if (!mounted.current) return;
      globalThis.localStorage.removeItem(supportDraftKey(owner));
      setDraft({ owner, kind: 'problem', message: '', attempt: null });
      setNotice('Message sent. Replies appear in Your messages.');
      await query.refresh();
    } catch (error) {
      if (mounted.current)
        setIssue(
          error instanceof DataAccessError && error.code === '54000'
            ? 'You have reached today’s request limit. Retry tomorrow.'
            : 'Could not confirm delivery. Retry to send the same message.',
        );
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const locked = busy || Boolean(draft.attempt);
  return (
    <Screen
      insetTop={false}
      refreshControl={
        <RefreshControl
          refreshing={query.loading}
          onRefresh={() => void query.refresh()}
          tintColor={colors.primary}
        />
      }
    >
      <ScreenHeading title="How can we help?" />
      <Notice message="For urgent help, use Get help in your night." />
      <Choice
        label="Something isn't working"
        selected={draft.kind === 'problem'}
        disabled={locked}
        onPress={() => setDraft({ ...draft, kind: 'problem' })}
      />
      <Choice
        label="I have an idea"
        selected={draft.kind === 'feedback'}
        disabled={locked}
        onPress={() => setDraft({ ...draft, kind: 'feedback' })}
      />
      <TextField
        label={draft.kind === 'feedback' ? 'Your idea' : 'What happened?'}
        multiline
        value={draft.message}
        maxLength={4000}
        editable={!locked}
        onChangeText={(message) => setDraft({ ...draft, message })}
      />
      {draft.attempt ? (
        <Notice message="This message is waiting for confirmation. Retry to avoid sending it twice." />
      ) : null}
      {issue ? <Notice error message={issue} /> : null}
      {storageBlocked ? (
        <PrimaryButton
          label="Discard unreadable draft"
          variant="danger"
          onPress={() => {
            try {
              globalThis.localStorage.removeItem(supportDraftKey(owner));
              setStorageBlocked(false);
              setIssue(null);
            } catch {
              setIssue('Device storage is unavailable. Retry discarding the draft.');
            }
          }}
        />
      ) : null}
      {notice ? <Notice message={notice} /> : null}
      <PrimaryButton
        label={draft.attempt ? 'Retry message' : 'Send message'}
        icon="send-outline"
        busy={busy}
        disabled={!ready || storageBlocked || draft.message.trim().length < 10}
        onPress={() => void send()}
      />
      <Text accessibilityRole="header" style={typography.sectionTitle}>
        Your messages
      </Text>
      {!query.data ? (
        query.issue ? (
          <RetryPanel issue={query.issue} retry={() => void query.refresh()} />
        ) : (
          <LoadingPanel />
        )
      ) : query.data.length === 0 ? (
        <Notice message="No messages yet." />
      ) : (
        query.data.map((request) => (
          <Panel key={request.id}>
            <Text style={typography.sectionTitle}>
              {request.kind === 'feedback' ? 'Idea' : 'Problem'} ·{' '}
              {request.status === 'in_review'
                ? 'In review'
                : request.status === 'completed'
                  ? 'Completed'
                  : 'Received'}
            </Text>
            <Text style={typography.body}>{new Date(request.created_at).toLocaleDateString()}</Text>
            <Text selectable style={{ ...typography.body, color: colors.text }}>
              {request.message}
            </Text>
            {request.response ? (
              <>
                <Text style={typography.sectionTitle}>Reply</Text>
                <Text selectable style={typography.body}>
                  {request.response}
                </Text>
              </>
            ) : null}
          </Panel>
        ))
      )}
      {query.data && query.issue ? (
        <RetryPanel issue={query.issue} retry={() => void query.refresh()} />
      ) : null}
    </Screen>
  );
}
