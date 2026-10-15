import 'expo-sqlite/localStorage/install';
import { Storage } from 'expo-sqlite/kv-store';
import * as Crypto from 'expo-crypto';
import { QuickLogStore } from '@dwd/contracts';
import { quickScope, type QuickScope } from '@dwd/core';

const stores = new Map<QuickScope, QuickLogStore>();
export function nativeQuickStore(scope: QuickScope) {
  let store = stores.get(scope);
  if (!store) {
    store = new QuickLogStore(
      {
        getItem: (key) => Storage.getItemSync(key),
        setItem: (key, value) => Storage.setItemSync(key, value),
        updateItem: (key, update) => Storage.setItemSync(key, update),
      },
      scope,
      Crypto.randomUUID,
    );
    stores.set(scope, store);
  }
  store.hydrate();
  return store;
}

/** Guest access is explicit after sign-in; no account's history is reassigned. */
export function nativeQuickOffer(
  accountId: string,
  destination?: 'create' | 'invite',
  nightId?: string,
): { scope: QuickScope; sessionId: string } | null {
  if (destination) {
    for (const scope of [quickScope(accountId), 'guest' as const]) {
      const store = nativeQuickStore(scope);
      const intent = store.getSnapshot().record.intent;
      if (
        intent?.accountId === accountId &&
        (intent.destination === destination || (nightId && intent.nightId === nightId))
      ) {
        const session = store.session(intent.sessionId);
        if (session?.entries.some((e) => !e.removedAt && !e.destination))
          return { scope, sessionId: session.id };
      }
    }
    return null;
  }
  const explicit = nativeQuickOffer(accountId, 'invite') ?? nativeQuickOffer(accountId, 'create');
  if (explicit) return explicit;
  for (const scope of [quickScope(accountId), 'guest' as const]) {
    const store = nativeQuickStore(scope);
    const state = store.getSnapshot();
    const intent = state.record.intent;
    const session = store.session(intent?.sessionId ?? state.record.activeSessionId);
    if (
      !state.blocked &&
      session?.entries.some((e) => !e.removedAt && !e.destination) &&
      (!intent?.accountId || intent.accountId === accountId)
    )
      return { scope, sessionId: session.id };
  }
  return null;
}
