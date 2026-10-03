import { useCallback, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { useFocusEffect } from 'expo-router';
import { Text, View } from 'react-native';
import type { NightSnapshot } from '@dwd/core';
import { acknowledgeNotification, getMyNotificationEvents, sendCheckIn } from '@dwd/data';
import { useAccountQuery } from '@/hooks/use-account-query';
import { useNightAction } from '@/hooks/use-night-action';
import { nightAccess, nightEvents, RetryKeys } from '@/lib/night-features';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme } from '@/providers/theme-provider';
import { PrimaryButton } from './primary-button';
import { Notice, Panel } from './screen';

export function useCheckIns(snapshot: NightSnapshot, refresh: () => Promise<void>) {
  const { client } = useSupabase();
  const action = useNightAction(refresh);
  const keys = useRef(new RetryKeys(Crypto.randomUUID));
  const inFlight = useRef(false);
  const [sendingMemberId, setSendingMemberId] = useState<string | null>(null);
  const [feedbackMemberId, setFeedbackMemberId] = useState<string | null>(null);
  async function send(memberId: string) {
    const { member, canCheckIn } = nightAccess(snapshot, memberId);
    if (!client || !member || !canCheckIn || inFlight.current) return;
    inFlight.current = true;
    setSendingMemberId(memberId);
    setFeedbackMemberId(memberId);
    const scope = `${snapshot.currentUserId}:${snapshot.night.id}:${memberId}`;
    await action.run(
      async () => {
        const result = await sendCheckIn(
          client,
          snapshot.night.id,
          memberId,
          keys.current.get(scope),
        );
        // Cooldown and local-only are definite responses; neither means a notification was sent.
        keys.current.complete(scope);
        if (result.status !== 'sent') throw new Error(result.message);
        return result;
      },
      member.memberType === 'guest'
        ? `Asked the host to check in with ${member.displayName}.`
        : `Check-in sent to ${member.displayName}.`,
    );
    inFlight.current = false;
    setSendingMemberId(null);
  }
  return { ...action, sendingMemberId, feedbackMemberId, send };
}

export function NightCheckIns({ snapshot, now }: { snapshot: NightSnapshot; now: number }) {
  const { client } = useSupabase();
  const { typography } = useTheme();
  const query = useAccountQuery(getMyNotificationEvents, `check-ins:${snapshot.night.id}`);
  const refresh = query.refresh;
  const action = useNightAction(query.refresh);
  const [readingId, setReadingId] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      const timer = setInterval(() => void refresh(), 15_000);
      return () => clearInterval(timer);
    }, [refresh]),
  );
  const events = nightEvents(
    query.data ?? [],
    snapshot.currentUserId,
    snapshot.night.id,
    now,
  ).filter((event) => event.acknowledgedAt === null);
  if (!events.length && !query.issue) return null;
  return (
    <Panel>
      <Text accessibilityRole="header" style={typography.sectionTitle}>
        Check-ins and reminders
      </Text>
      {query.issue ? <Notice error message={query.issue} /> : null}
      {events.map((event) => (
        <View key={event.id} style={{ gap: 10 }}>
          <Text style={typography.body}>{event.body.replace(/\bwater\b/gi, 'chaser')}</Text>
          <PrimaryButton
            label="Mark read"
            variant="quiet"
            busy={action.busy && readingId === event.id}
            busyLabel="Marking read"
            disabled={action.busy}
            onPress={() => {
              setReadingId(event.id);
              if (client) void action.run(() => acknowledgeNotification(client, event.id));
            }}
          />
        </View>
      ))}
      {action.issue ? <Notice error message={action.issue} /> : null}
      {query.issue ? (
        <PrimaryButton label="Retry" variant="secondary" onPress={() => void query.refresh()} />
      ) : null}
    </Panel>
  );
}
