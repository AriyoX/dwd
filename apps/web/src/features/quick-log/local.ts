'use client';
import { QuickLogStore } from '@dwd/contracts';
import { availableQuickEntries, quickScope, type QuickScope } from '@dwd/core';

const stores = new Map<QuickScope, QuickLogStore>();
export function browserQuickStore(scope: QuickScope) {
  let store = stores.get(scope);
  if (!store) {
    store = new QuickLogStore(
      {
        getItem: (key) => localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
      },
      scope,
      () => crypto.randomUUID(),
    );
    stores.set(scope, store);
  }
  store.hydrate();
  return store;
}
export function browserQuickOffer(
  accountId: string,
  destination?: 'create' | 'invite',
  nightId?: string,
): { scope: QuickScope; sessionId: string } | null {
  if (destination) {
    for (const scope of [quickScope(accountId), 'guest' as const]) {
      const store = browserQuickStore(scope);
      store.reload();
      const intent = store.getSnapshot().record.intent;
      if (
        intent?.accountId === accountId &&
        (intent.destination === destination || (nightId && intent.nightId === nightId))
      ) {
        const session = store.session(intent.sessionId);
        if (session && availableQuickEntries(session).length)
          return { scope, sessionId: session.id };
      }
    }
    return null;
  }
  const explicit = browserQuickOffer(accountId, 'invite') ?? browserQuickOffer(accountId, 'create');
  if (explicit) return explicit;
  for (const scope of [quickScope(accountId), 'guest' as const]) {
    const store = browserQuickStore(scope);
    store.reload();
    const { record, blocked } = store.getSnapshot();
    const session = store.session(record.intent?.sessionId ?? record.activeSessionId);
    if (
      !blocked &&
      session &&
      availableQuickEntries(session).length &&
      (!record.intent?.accountId || record.intent.accountId === accountId)
    )
      return { scope, sessionId: session.id };
  }
  return null;
}
export const quickWriterName = (scope: QuickScope) => `dwd.quick-log.writer:${scope}`;
export const browserLocks = () => (navigator as Partial<Pick<Navigator, 'locks'>>).locks;

/** Outside the logger, invitation/setup handoffs take the same writer lock for one atomic record change. */
export async function rememberQuickDestination(
  accountId: string,
  nightId: string,
  kind: 'invite' | 'create',
) {
  const offer = browserQuickOffer(accountId, kind, nightId);
  if (!offer) return null;
  const store = browserQuickStore(offer.scope);
  const intent = store.getSnapshot().record.intent;
  if (
    kind === 'create' &&
    (intent?.accountId !== accountId ||
      (intent.destination !== 'create' && intent.nightId !== nightId))
  )
    return null;
  const locks = browserLocks();
  if (!locks)
    throw new Error('Couldn’t save the destination on this device. Keep this setup and retry.');
  await locks.request(quickWriterName(offer.scope), { ifAvailable: true }, (lock) => {
    if (!lock) throw new Error('Close Quick Log in another tab, then retry this setup.');
    store.reload();
    store.setIntent({ sessionId: offer.sessionId, accountId, nightId, destination: 'choose' });
    if (!store.getSnapshot().saved)
      throw new Error('Couldn’t save the destination on this device. Retry this setup.');
  });
  return offer;
}
