import { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { confirmationMessage, type NightSnapshot } from '@dwd/core';
import { useOffline } from '@/providers/offline-provider';
import { useTheme } from '@/providers/theme-provider';
import { pendingForSnapshot, type NativePendingLog } from '@/lib/offline-logging';
import { confirmAction } from '@/lib/confirm';
import { PrimaryButton } from './primary-button';
import { Notice, Panel } from './screen';

export function PendingLogs({
  nightId,
  snapshot,
}: {
  nightId?: string;
  snapshot?: NightSnapshot | null;
}) {
  const { outbox, records, issue, retry } = useOffline();
  const { colors, typography } = useTheme();
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const visible = snapshot
    ? pendingForSnapshot(snapshot, records)
    : records.filter((record) => !nightId || record.nightId === nightId);
  async function act(record: NativePendingLog, remove: boolean) {
    if (!outbox || busyKey) return;
    setBusyKey(record.idempotencyKey);
    setMessage(null);
    try {
      if (remove) {
        if (
          await confirmAction(
            'Remove this entry?',
            record.attempted
              ? 'If it may have saved, a connection is needed to check and undo it.'
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
          if (outbox.current()) await outbox.confirm(record.idempotencyKey);
        }
      } else {
        await outbox.syncOne(record.idempotencyKey);
      }
    } catch (error) {
      if (outbox.current())
        setMessage(
          error instanceof Error && /^(Reconnect|Entry saved)/.test(error.message)
            ? error.message
            : 'Could not change this entry. Reconnect and retry.',
        );
    } finally {
      if (outbox.current()) setBusyKey(null);
    }
  }
  if (!visible.length && !issue && !message) return null;
  return (
    <View style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={typography.sectionTitle}>
        Entries waiting to sync
      </Text>
      {issue ? (
        <>
          <Notice error message={issue} />
          <PrimaryButton label="Retry" variant="quiet" onPress={() => void retry()} />
        </>
      ) : null}
      {message ? <Notice message={message} error /> : null}
      {snapshot?.night.status === 'ended' && visible.length ? (
        <Notice message="Reconnect within 24 hours of the night ending to save entries made before it ended." />
      ) : null}
      {visible.map((record) => (
        <Panel key={record.idempotencyKey}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
            {record.memberDisplayName} ·{' '}
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
          {record.drinkSnapshot ? (
            <Text style={typography.body}>
              {record.drinkSnapshot.volumeMl} ml · {record.drinkSnapshot.abvPercent}% ABV
            </Text>
          ) : null}
          <Notice
            error={record.status === 'permanent_failure'}
            message={
              record.status === 'needs_confirmation'
                ? 'Review needed'
                : record.status === 'permanent_failure'
                  ? 'Could not save'
                  : record.status === 'syncing'
                    ? 'Syncing'
                    : 'Saved on this device'
            }
          />
          {record.lastError ? <Notice message={record.lastError} /> : null}
          {record.status !== 'permanent_failure' ? (
            <PrimaryButton
              label={record.status === 'needs_confirmation' ? 'Review warning' : 'Retry sync'}
              variant="secondary"
              busy={busyKey === record.idempotencyKey}
              disabled={Boolean(busyKey) || record.status === 'syncing'}
              onPress={() => void act(record, false)}
            />
          ) : null}
          <PrimaryButton
            label="Remove entry"
            variant="quiet"
            disabled={Boolean(busyKey) || record.status === 'syncing'}
            onPress={() => void act(record, true)}
          />
          {!nightId ? (
            <PrimaryButton
              label="Open night"
              variant="quiet"
              onPress={() => router.push(`/night/${record.nightId}`)}
            />
          ) : null}
        </Panel>
      ))}
    </View>
  );
}
