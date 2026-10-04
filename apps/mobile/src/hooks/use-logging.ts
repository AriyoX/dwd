import { useLayoutEffect, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { type CustomDrinkInput, type DrinkLogResult, type NightSnapshot } from '@dwd/core';
import { useSupabase } from '@/providers/supabase-provider';
import { useOffline } from '@/providers/offline-provider';
import { confirmAction } from '@/lib/confirm';
import { makePendingLog } from '@/lib/offline-logging';
import { nativeLogSender } from '@/lib/offline-logging-api';
import { submitDrink } from '@/lib/logging';
import { bottleLogIssue, nightAccess } from '@/lib/night-features';

export function useLogging(onSaved: () => void, snapshot?: NightSnapshot | null) {
  const { client, session } = useSupabase();
  const { outbox, retry } = useOffline();
  const owner = session?.user.id;
  const currentOwner = useRef(owner);
  const mounted = useRef(true);
  useLayoutEffect(() => {
    currentOwner.current = owner;
  }, [owner]);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inFlight = useRef(false);
  const bottleAttempt = useRef<{ fingerprint: string; key: string; consumedAt: string } | null>(
    null,
  );

  async function log(
    targetMemberId: string,
    choice: { planItemId: string } | { customDrink: CustomDrinkInput } | 'water',
  ) {
    if (!outbox || !snapshot || snapshot.currentUserId !== owner || inFlight.current) return false;
    const current = () => mounted.current && currentOwner.current === owner && outbox.current();
    if (!current() || !nightAccess(snapshot, targetMemberId).canLog) return false;
    const problem = bottleLogIssue(snapshot, targetMemberId, choice);
    if (problem) {
      setIssue(problem);
      return false;
    }
    inFlight.current = true;
    setBusy(true);
    setIssue(null);
    setNotice(null);
    let durable = false;
    try {
      const fingerprint = JSON.stringify([owner, targetMemberId, choice]);
      const previous =
        bottleAttempt.current?.fingerprint === fingerprint ? bottleAttempt.current : null;
      const record = makePendingLog(
        snapshot,
        targetMemberId,
        choice,
        outbox.store.getAll(),
        previous?.key ?? Crypto.randomUUID(),
        previous?.consumedAt ?? new Date().toISOString(),
      );
      if (record.drinkSnapshot?.sharedBottleId) {
        if (!client || !session || !owner) return false;
        bottleAttempt.current = {
          fingerprint,
          key: record.idempotencyKey,
          consumedAt: record.consumedAt,
        };
        const sender = nativeLogSender(client, current, undefined, () => ({
          actorUserId: owner,
          accessToken: session.access_token,
        }));
        const result = await submitDrink(
          {
            targetMemberId,
            consumedAt: record.consumedAt,
            idempotencyKey: record.idempotencyKey,
            ...(choice === 'water' ? {} : choice),
            acknowledgePlanExceeded: false,
            acknowledgeAfterEnd: false,
          },
          async (command) =>
            (await sender.send({
              ...record,
              acknowledgePlanExceeded: command.acknowledgePlanExceeded,
              acknowledgeAfterEnd: command.acknowledgeAfterEnd,
            })) as DrinkLogResult,
          (message) => confirmAction('Log outside your plan?', message, 'Log drink'),
        );
        if (!current()) return false;
        if (!result) {
          bottleAttempt.current = null;
          return false;
        }
        if (result.status !== 'created' && result.status !== 'duplicate') {
          setIssue(result.message);
          if (result.status === 'permanently_rejected') bottleAttempt.current = null;
          return false;
        }
        bottleAttempt.current = null;
        setNotice('Drink logged.');
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => undefined,
        );
        onSaved();
        return true;
      }
      outbox.enqueue(record);
      durable = true;
      if (record.status === 'needs_confirmation') {
        const confirmed = await confirmAction(
          'Log outside your plan?',
          record.lastError ?? '',
          'Log drink',
        );
        if (!current()) return false;
        if (!confirmed) {
          await outbox.remove(record.idempotencyKey);
          return false;
        }
        // Persist acknowledgment before replay. Sending can finish after this sheet closes.
        void outbox.confirm(record.idempotencyKey).catch(() => undefined);
      } else {
        void retry();
      }
      if (!current()) return false;
      setNotice('Saved on this device. Waiting to sync.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
      onSaved();
      return true;
    } catch {
      if (current())
        setIssue(
          bottleAttempt.current?.fingerprint === JSON.stringify([owner, targetMemberId, choice])
            ? 'Shared bottles need a connection. Retry to check and save the same pour.'
            : durable
              ? 'Entry kept on this device. Open Pending entries to review it.'
              : 'Could not save on this device. Free some storage and try again.',
        );
      return false;
    } finally {
      inFlight.current = false;
      if (current()) setBusy(false);
    }
  }
  return { log, busy, issue, notice };
}
