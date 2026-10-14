import type { QuickReceipt, QuickTransfer } from '@dwd/core';
import type { QuickLogStore } from '../storage/quick-log-store';

const running = new WeakMap<QuickLogStore, Set<string>>();
/** Foreground only. An ambiguous response keeps the same durable operation and freezes its source revisions. */
export async function executeQuickTransfer(
  store: QuickLogStore,
  operation: QuickTransfer,
  currentAccount: () => string | null,
  online: boolean,
  request: (operation: QuickTransfer) => Promise<QuickReceipt>,
) {
  if (!online) throw new Error('Go online to add this to a night');
  if (currentAccount() !== operation.accountId)
    throw new Error('Sign in to the account that started adding these logs.');
  if (!store.getSnapshot().saved)
    throw new Error('Save on this device before adding logs to a night.');
  let ids = running.get(store);
  if (!ids) {
    ids = new Set();
    running.set(store, ids);
  }
  if (ids.has(operation.id)) throw new Error('These entries are already being added.');
  ids.add(operation.id);
  try {
    const receipt = await request(operation);
    if (currentAccount() !== operation.accountId)
      throw new Error('Sign in to the account that started adding these logs to check the result.');
    store.confirmTransfer(operation.id, receipt);
    return receipt;
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    const message =
      error instanceof Error
        ? error.message
        : error && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : '';
    // Only the authenticated RPC's no-receipt checks can resolve a rejection.
    // Gateway errors and source conflicts cannot rule out an earlier commit.
    const rejectedAuthorization =
      code === '42501' &&
      [
        'This night is unavailable or has ended.',
        'Add logs to your own participant record.',
      ].includes(message);
    const rejectedValidation = code.startsWith('22') && !message.includes('This request changed');
    const rejectedRevision =
      code === '40001' &&
      message === 'This Quick Log entry changed on another device. Review your entries.';
    if (rejectedAuthorization || rejectedValidation || rejectedRevision)
      store.transferRejected(operation.id);
    else store.transferUncertain(operation.id);
    throw error;
  } finally {
    ids.delete(operation.id);
  }
}
