import { useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { confirmationMessage, type NightSnapshot } from '@dwd/core';
import { useOffline } from '@/providers/offline-provider';
import { useConnectivity } from '@/providers/connectivity-provider';
import { useTheme } from '@/providers/theme-provider';
import { pendingForSnapshot, type NativePendingLog } from '@/lib/offline-logging';
import { confirmAction } from '@/lib/confirm';
import { savedEntryFailureMessage } from '@/lib/entry-message';
import { Disclosure } from './disclosure';
import { PrimaryButton } from './primary-button';
import { Notice, Panel } from './screen';

export function PendingLogs({
  nightId,
  snapshot,
  memberId,
}: {
  nightId?: string;
  snapshot?: NightSnapshot | null;
  memberId?: string;
}) {
  const { outbox, records, issue, retry } = useOffline();
  const { online } = useConnectivity();
  const { colors, typography } = useTheme();
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<{ key: string; remove: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const visible = (
    snapshot
      ? pendingForSnapshot(snapshot, records)
      : records.filter((record) => !nightId || record.nightId === nightId)
  ).filter((record) => !memberId || record.nightMemberId === memberId);
  async function act(record: NativePendingLog, remove: boolean) {
    if (!outbox || busyAction) return;
    if (
      online === false &&
      (remove
        ? record.attempted &&
          record.status !== 'needs_confirmation' &&
          record.status !== 'permanent_failure'
        : record.status !== 'needs_confirmation')
    ) {
      setMessage(
        remove
          ? 'Connect to the internet so we can check and remove this entry.'
          : "You're offline. We'll save it for later.",
      );
      return;
    }
    setBusyAction({ key: record.idempotencyKey, remove });
    setMessage(null);
    try {
      if (remove) {
        if (
          await confirmAction(
            'Remove this entry?',
            record.attempted
              ? 'Connect to the internet so we can check and remove it.'
              : 'This entry will be removed from this device.',
            'Remove entry',
            true,
          )
        ) {
          if (outbox.current()) await outbox.remove(record.idempotencyKey);
        }
      } else if (record.status === 'needs_confirmation') {
        if (
          await confirmAction(
            'Log outside your plan?',
            confirmationMessage(record.requiredWarnings ?? []),
            'Log drink',
          )
        ) {
          if (outbox.current()) await outbox.confirm(record.idempotencyKey, online !== false);
        }
      } else {
        await outbox.syncOne(record.idempotencyKey);
      }
    } catch (error) {
      if (outbox.current())
        setMessage(
          error instanceof Error && /^(Connect to the internet|Entry saved)/.test(error.message)
            ? error.message
            : "Couldn't change this entry. Try again when you're online.",
        );
    } finally {
      if (outbox.current()) setBusyAction(null);
    }
  }
  if (!visible.length && !issue && !message) return null;
  return (
    <View style={{ gap: 12 }}>
      {issue ? (
        <>
          <Notice error message={issue} />
          <PrimaryButton label="Try again" variant="quiet" onPress={() => void retry()} />
        </>
      ) : null}
      {message ? <Notice dismissible message={message} error /> : null}
      {snapshot?.night.status === 'ended' && visible.length ? (
        <Notice message="Connect to the internet within 24 hours of this night ending to save these entries." />
      ) : null}
      {visible.map((record) => (
        <Panel key={record.idempotencyKey} style={{ padding: 14, gap: 6 }}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
            {!memberId ? `${record.memberDisplayName} · ` : ''}
            {record.kind === 'water'
              ? 'Chaser'
              : (record.planItemLabel ?? record.drinkSnapshot?.label ?? 'Drink')}
          </Text>
          <Text style={typography.body}>
            {new Date(record.consumedAt).toLocaleString([], {
              ...(snapshot ? { timeZone: snapshot.night.timezone } : {}),
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Ionicons
              name="cloud-upload-outline"
              size={16}
              color={colors.muted}
              accessible={false}
            />
            <Text style={typography.body}>
              {record.status === 'needs_confirmation'
                ? 'Review needed'
                : record.status === 'permanent_failure'
                  ? 'Needs attention'
                  : record.status === 'syncing'
                    ? 'Saving…'
                    : 'Saved · not synced yet'}
            </Text>
          </View>
          <Disclosure
            title="Entry options"
            defaultExpanded={
              record.status === 'needs_confirmation' || record.status === 'permanent_failure'
            }
          >
            {record.drinkSnapshot ? (
              <Text style={typography.body}>
                {record.drinkSnapshot.volumeMl} ml · {record.drinkSnapshot.abvPercent}% ABV
              </Text>
            ) : null}
            {record.status === 'permanent_failure' && record.lastError ? (
              <Notice message={savedEntryFailureMessage(record.lastError)} error />
            ) : null}
            {record.status === 'needs_confirmation' ||
            (online !== false &&
              record.status !== 'permanent_failure' &&
              record.status !== 'syncing') ? (
              <PrimaryButton
                label={record.status === 'needs_confirmation' ? 'Review entry' : 'Try again'}
                variant="secondary"
                busy={busyAction?.key === record.idempotencyKey && !busyAction.remove}
                busyLabel={record.status === 'needs_confirmation' ? 'Reviewing' : 'Saving'}
                disabled={Boolean(busyAction)}
                onPress={() => void act(record, false)}
              />
            ) : null}
            <PrimaryButton
              label="Remove entry"
              variant="quiet"
              busy={busyAction?.key === record.idempotencyKey && busyAction.remove}
              busyLabel="Removing entry"
              disabled={Boolean(busyAction) || record.status === 'syncing'}
              onPress={() => void act(record, true)}
            />
            {!nightId ? (
              <PrimaryButton
                label="Open night"
                variant="quiet"
                onPress={() => router.push(`/night/${record.nightId}`)}
              />
            ) : null}
          </Disclosure>
        </Panel>
      ))}
    </View>
  );
}
