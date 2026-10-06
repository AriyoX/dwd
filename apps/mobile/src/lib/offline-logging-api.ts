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
  function connection(actorUserId: string, signal?: AbortSignal) {
    const auth = authorization?.();
    if (authorization && (!auth || auth.actorUserId !== actorUserId))
      throw new Error('Account changed.');
    if (!auth && !signal) return client;
    // Pin the actor's token on this request: the shared client's session can change
    // while Supabase awaits authentication before starting the network fetch.
    const scoped = Object.create(client) as SupabaseClient<Database>;
    scoped.rpc = (fn, args, options) => {
      const request = client.rpc(fn, args, options);
      if (auth) request.setHeader('Authorization', `Bearer ${auth.accessToken}`);
      if (signal) request.abortSignal(signal);
      return request;
    };
    return scoped;
  }
  return {
    current,
    send: (record: NativePendingLog, signal?: AbortSignal) => {
      if (!current()) return Promise.reject(new Error('Account changed.'));
      if (!foreground()) return Promise.reject(new Error('App is in the background.'));
      const scoped = connection(record.actorUserId, signal);
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
    delete: (id: string, kind: 'alcohol' | 'water', signal?: AbortSignal) => {
      if (!current()) return Promise.reject(new Error('Account changed.'));
      const auth = authorization?.();
      if (authorization && !auth) return Promise.reject(new Error('Account changed.'));
      return softDeleteActivity(connection(auth?.actorUserId ?? '', signal), id, kind);
    },
  };
}
