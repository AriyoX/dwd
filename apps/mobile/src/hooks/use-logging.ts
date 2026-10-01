import { useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { createDrinkLog, createWaterLog } from '@dwd/data';
import {
  drinkLogCommandSchema,
  waterLogCommandSchema,
  type CustomDrinkInput,
  type DrinkLogCommand,
} from '@dwd/core';
import { useSupabase } from '@/providers/supabase-provider';
import { confirmAction } from '@/lib/confirm';
import { submitDrink } from '@/lib/logging';

export function useLogging(onSaved: () => void) {
  const { client, session } = useSupabase();
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pending = useRef<{ fingerprint: string; key: string; consumedAt: string } | null>(null);
  const inFlight = useRef(false);
  async function log(
    targetMemberId: string,
    choice: { planItemId: string } | { customDrink: CustomDrinkInput } | 'water',
  ) {
    if (!client || !session || inFlight.current) return false;
    const fingerprint = JSON.stringify([session.user.id, targetMemberId, choice]);
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = {
        fingerprint,
        key: Crypto.randomUUID(),
        consumedAt: new Date().toISOString(),
      };
    const command = {
      targetMemberId,
      consumedAt: pending.current.consumedAt,
      idempotencyKey: pending.current.key,
    };
    inFlight.current = true;
    setBusy(true);
    setIssue(null);
    setNotice(null);
    try {
      const result =
        choice === 'water'
          ? await createWaterLog(client, waterLogCommandSchema.parse(command))
          : await submitDrink(
              drinkLogCommandSchema.parse({
                ...command,
                ...choice,
                acknowledgePlanExceeded: false,
                acknowledgeAfterEnd: false,
              }) as DrinkLogCommand,
              (input) => createDrinkLog(client, input),
              (message) => confirmAction('Log outside your plan?', message, 'Log drink'),
            );
      if (result === null) {
        pending.current = null;
        return false;
      }
      if (result.status !== 'created' && result.status !== 'duplicate') {
        setIssue(result.message);
        if (result.status === 'permanently_rejected') pending.current = null;
        return false;
      }
      pending.current = null;
      setNotice(choice === 'water' ? 'Water logged.' : 'Drink logged.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
      onSaved();
      return true;
    } catch {
      setIssue('Could not save. Retry to check and save the same entry.');
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return { log, busy, issue, notice };
}
