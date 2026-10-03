import type { SupabaseClient } from '@supabase/supabase-js';
import { createDrinkLog, createWaterLog, softDeleteActivity } from '@dwd/data';
import type { Database } from '@dwd/core';
import type { NativePendingLog } from './offline-logging';

export function nativeLogSender(
  client: SupabaseClient<Database>,
  current: () => boolean,
  foreground: () => boolean = () => true,
  authorization?: () => { actorUserId: string; accessToken: string } | null,
) {
  function connection(actorUserId: string) {
    const auth = authorization?.();
    if (authorization && (!auth || auth.actorUserId !== actorUserId))
      throw new Error('Account changed.');
    if (!auth) return client;
    // Pin the actor's token on this request: the shared client's session can change
    // while Supabase awaits authentication before starting the network fetch.
    const scoped = Object.create(client) as SupabaseClient<Database>;
    scoped.rpc = (fn, args, options) =>
      client.rpc(fn, args, options).setHeader('Authorization', `Bearer ${auth.accessToken}`);
    return scoped;
  }
  return {
    current,
    send: (record: NativePendingLog) => {
      if (!current()) return Promise.reject(new Error('Account changed.'));
      if (!foreground()) return Promise.reject(new Error('App is in the background.'));
      const scoped = connection(record.actorUserId);
      const command = {
        targetMemberId: record.nightMemberId,
        consumedAt: record.consumedAt,
        idempotencyKey: record.idempotencyKey,
      };
      return record.kind === 'water'
        ? createWaterLog(scoped, command)
        : createDrinkLog(scoped, {
            ...command,
            ...(record.planItemId ? { planItemId: record.planItemId } : {}),
            ...(record.customDrink ? { customDrink: record.customDrink } : {}),
            acknowledgePlanExceeded: record.acknowledgePlanExceeded,
            acknowledgeAfterEnd: record.acknowledgeAfterEnd,
          });
    },
    delete: (id: string, kind: 'alcohol' | 'water') => {
      if (!current()) return Promise.reject(new Error('Account changed.'));
      const auth = authorization?.();
      if (authorization && !auth) return Promise.reject(new Error('Account changed.'));
      return softDeleteActivity(auth ? connection(auth.actorUserId) : client, id, kind);
    },
  };
}
