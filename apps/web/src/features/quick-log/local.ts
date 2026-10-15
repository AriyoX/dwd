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
  function offerFrom(store: QuickLogStore, sessionId: string | null) {
    let session = store.session(sessionId);
    if (session?.claimedBy && session.claimedBy !== accountId) return null;
    if (store.scope === 'guest' && session?.claimedBy === accountId) {
      // Adoption preserves the guest source for recovery. Its intent and entries
      // can be stale after an import; the account copy owns subsequent changes.
      const account = browserQuickStore(quickScope(accountId));
      account.reload();
      const adopted = account.session(session.id);
      if (adopted) {
        store = account;
        session = adopted;
      }
    }
    return !store.getSnapshot().blocked && session && availableQuickEntries(session).length
      ? { scope: store.scope, sessionId: session.id }
      : null;
  }
  if (destination) {
    for (const scope of [quickScope(accountId), 'guest' as const]) {
      const store = browserQuickStore(scope);
      store.reload();
      const intent = store.getSnapshot().record.intent;
      if (
        intent?.accountId === accountId &&
        (intent.destination === destination || (nightId && intent.nightId === nightId))
      ) {
        const offer = offerFrom(store, intent.sessionId);
        if (offer) return offer;
      }
    }
    return null;
  }
  const explicit = browserQuickOffer(accountId, 'invite') ?? browserQuickOffer(accountId, 'create');
  if (explicit) return explicit;
  for (const scope of [quickScope(accountId), 'guest' as const]) {
    const store = browserQuickStore(scope);
    store.reload();
    const { record } = store.getSnapshot();
    if (!record.intent?.accountId || record.intent.accountId === accountId) {
      const offer =
        (record.intent ? offerFrom(store, record.intent.sessionId) : null) ??
        offerFrom(store, record.activeSessionId);
      if (offer) return offer;
    }
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
