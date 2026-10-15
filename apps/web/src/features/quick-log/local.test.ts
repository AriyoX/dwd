import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { associateGuestQuickLogs } from '@dwd/contracts';
import { quickScope } from '@dwd/core';

beforeEach(() => {
  vi.resetModules();
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

async function adoptedGuest() {
  const { browserQuickOffer, browserQuickStore } = await import('./local');
  const owner = randomUUID();
  const guest = browserQuickStore('guest');
  const account = browserQuickStore(quickScope(owner));
  guest.acknowledgeEligibility();
  const { sessionId } = guest.log('drink');
  guest.setIntent({ sessionId, accountId: owner, nightId: null, destination: 'invite' });
  associateGuestQuickLogs(guest, account, owner);
  return { owner, guest, account, sessionId, browserQuickOffer };
}

describe('Quick Log invitation offers', () => {
  it('uses the account copy of an adopted guest session', async () => {
    const f = await adoptedGuest();
    f.account.setIntent(null);
    expect(f.browserQuickOffer(f.owner, 'invite')).toEqual({
      scope: quickScope(f.owner),
      sessionId: f.sessionId,
    });
  });

  it('ignores the stale guest intent after import and offers the next account session', async () => {
    const f = await adoptedGuest();
    const operation = f.account.prepareTransfer(f.sessionId, f.owner, randomUUID(), randomUUID());
    f.account.confirmTransfer(operation.id, {
      operationId: operation.id,
      accountId: f.owner,
      nightId: operation.nightId,
      memberId: operation.memberId,
      entries: operation.entries.map((entry) => ({
        sourceEntryId: entry.id,
        destinationEntryId: randomUUID(),
        revision: entry.revision,
      })),
    });
    f.account.setIntent({
      sessionId: f.sessionId,
      accountId: f.owner,
      nightId: operation.nightId,
      destination: 'choose',
    });
    expect(f.browserQuickOffer(f.owner)).toBeNull();
    f.account.finish(f.sessionId);
    const next = f.account.log('chaser');
    expect(f.browserQuickOffer(f.owner)).toEqual({
      scope: quickScope(f.owner),
      sessionId: next.sessionId,
    });
  });

  it('keeps the guest source available when adoption has not saved an account copy', async () => {
    const { browserQuickOffer, browserQuickStore } = await import('./local');
    const owner = randomUUID();
    const guest = browserQuickStore('guest');
    guest.acknowledgeEligibility();
    const { sessionId } = guest.log('chaser');
    guest.bindGuestSession(sessionId, owner);
    expect(browserQuickOffer(owner)).toEqual({ scope: 'guest', sessionId });
    expect(browserQuickOffer(randomUUID())).toBeNull();
  });
});
