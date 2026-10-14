import { quickScope, quickSessionSchema, quickSyncFingerprint, type QuickSession } from '@dwd/core';
import type { QuickLogStore } from '../storage/quick-log-store';

export type QuickSyncMutation = (work: () => void) => Promise<void>;
const running = new WeakSet<QuickLogStore>();

/** Account binding is durable before any request. Guest copies survive partial writes and retries. */
export function associateGuestQuickLogs(
  guest: QuickLogStore,
  account: QuickLogStore,
  accountId: string,
) {
  if (account.scope !== quickScope(accountId)) throw new Error('Unexpected Quick Log account.');
  for (const source of guest.getSnapshot().record.sessions) {
    if (source.claimedBy && source.claimedBy !== accountId) continue;
    if (
      guest
        .getSnapshot()
        .record.operations.some((o) => o.sessionId === source.id && o.accountId !== accountId)
    )
      continue;
    if (source.claimedBy === accountId && account.session(source.id)) {
      if (!account.getSnapshot().saved) account.retrySave();
      if (!account.getSnapshot().saved)
        throw new Error('Couldn’t save your account’s device copy. Your guest logs are kept.');
      if (source.state === 'active') guest.retireGuestSession(source.id, accountId);
      continue;
    }
    guest.bindGuestSession(source.id, accountId);
    if (!guest.getSnapshot().saved)
      throw new Error('Couldn’t save account ownership on this device. Your logs are kept.');
    const bound = guest.session(source.id);
    if (!bound) continue;
    account.adoptGuestSession(bound, guest.getSnapshot().record, accountId);
    if (!account.getSnapshot().saved)
      throw new Error('Couldn’t save your account’s device copy. Your guest logs are kept.');
    guest.retireGuestSession(source.id, accountId);
    if (!guest.getSnapshot().saved)
      throw new Error('Couldn’t finish the device handoff. Your logs are kept.');
  }
}

export async function synchronizeQuickLogs({
  guest,
  account,
  accountId,
  currentAccount,
  mutate,
  online,
  save,
  list,
}: {
  guest: QuickLogStore;
  account: QuickLogStore;
  accountId: string;
  currentAccount: () => string | null;
  mutate: QuickSyncMutation;
  online: boolean;
  save: (session: QuickSession, entries: QuickSession['entries']) => Promise<QuickSession>;
  list: () => Promise<QuickSession[]>;
}) {
  if (running.has(account)) return false;
  running.add(account);
  const checkOwner = () => {
    if (currentAccount() !== accountId)
      throw new Error('Your account changed. Your logs are kept.');
  };
  try {
    checkOwner();
    await mutate(() => {
      checkOwner();
      associateGuestQuickLogs(guest, account, accountId);
    });
    if (!online) return true;
    for (const session of [...account.getSnapshot().record.sessions]) {
      checkOwner();
      if (account.getSnapshot().record.synced[session.id] === quickSyncFingerprint(session))
        continue;
      if (!account.getSnapshot().saved)
        throw new Error('Save on this device before saving to your account.');
      let receipt: QuickSession | undefined;
      for (let i = 0; i < Math.max(1, session.entries.length); i += 500) {
        checkOwner();
        receipt = quickSessionSchema.parse(await save(session, session.entries.slice(i, i + 500)));
        if (
          receipt.id !== session.id ||
          receipt.scope !== quickScope(accountId) ||
          receipt.claimedBy !== accountId
        )
          throw new Error('Your account returned an unexpected session. Your logs are kept.');
      }
      checkOwner();
      if (!receipt) continue;
      const confirmed = receipt;
      if (
        Date.parse(confirmed.createdAt) !== Date.parse(session.createdAt) ||
        session.entries.some(
          (e) =>
            !confirmed.entries.some(
              (r) =>
                r.id === e.id &&
                r.sequence === e.sequence &&
                Date.parse(r.recordedAt) === Date.parse(e.recordedAt) &&
                (r.revision > e.revision ||
                  (r.revision === e.revision &&
                    r.kind === e.kind &&
                    (r.removedAt === e.removedAt ||
                      (r.removedAt &&
                        e.removedAt &&
                        Date.parse(r.removedAt) === Date.parse(e.removedAt))))),
            ),
        )
      )
        throw new Error('Your account did not confirm these entries. Your device copy is kept.');
      await mutate(() => {
        checkOwner();
        const unchanged =
          quickSyncFingerprint(account.session(session.id) ?? session) ===
          quickSyncFingerprint(session);
        account.mergeAccountSession(confirmed);
        account.markAccountSynced(
          session.id,
          unchanged
            ? quickSyncFingerprint(account.session(session.id) ?? confirmed)
            : quickSyncFingerprint(session),
        );
      });
    }
    const remote = await list();
    checkOwner();
    await mutate(() => {
      checkOwner();
      for (const session of remote) {
        const local = account.session(session.id);
        const clean =
          !local || account.getSnapshot().record.synced[session.id] === quickSyncFingerprint(local);
        account.mergeAccountSession(session);
        if (clean)
          account.markAccountSynced(
            session.id,
            quickSyncFingerprint(account.session(session.id) ?? session),
          );
      }
    });
    return true;
  } finally {
    running.delete(account);
  }
}
