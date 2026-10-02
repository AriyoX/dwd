import { useLayoutEffect, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { createDrinkLog, createWaterLog } from '@dwd/data';
import {
  drinkLogCommandSchema,
  waterLogCommandSchema,
  type CustomDrinkInput,
  type DrinkLogCommand,
  type NightSnapshot,
} from '@dwd/core';
import { useSupabase } from '@/providers/supabase-provider';
import { confirmAction } from '@/lib/confirm';
import { submitDrink } from '@/lib/logging';
import { bottleLogIssue, nightAccess } from '@/lib/night-features';

export function useLogging(onSaved: () => void, snapshot?: NightSnapshot | null) {
  const { client, session } = useSupabase();
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
  const pending = useRef<{ fingerprint: string; key: string; consumedAt: string } | null>(null);
  const inFlight = useRef(false);
  async function log(
    targetMemberId: string,
    choice: { planItemId: string } | { customDrink: CustomDrinkInput } | 'water',
  ) {
    if (!client || !session || inFlight.current) return false;
    const current = () => mounted.current && currentOwner.current === owner;
    if (!current()) return false;
    if (snapshot !== undefined) {
      if (!snapshot || !nightAccess(snapshot, targetMemberId).canLog) return false;
      const problem = bottleLogIssue(snapshot, targetMemberId, choice);
      if (problem) {
        setIssue(problem);
        return false;
      }
    }
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
              (input) => {
                if (!current()) return Promise.reject(new Error('Account changed.'));
                return createDrinkLog(client, input);
              },
              (message) => confirmAction('Log outside your plan?', message, 'Log drink'),
            );
      if (!current()) return false;
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
      setNotice(choice === 'water' ? 'Chaser logged.' : 'Drink logged.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
      onSaved();
      return true;
    } catch {
      if (current()) setIssue('Could not save. Retry to check and save the same entry.');
      return false;
    } finally {
      inFlight.current = false;
      if (current()) setBusy(false);
    }
  }
  return { log, busy, issue, notice };
}
