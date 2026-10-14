/* eslint-disable @typescript-eslint/no-non-null-assertion -- Fixtures assert the entries created by the immediately preceding log. */
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  availableQuickEntries,
  quickScope,
  type QuickReceipt,
  type QuickTransfer,
  type QuickScope,
} from '@dwd/core';
import { QuickLogStore } from '../storage/quick-log-store';
import { executeQuickTransfer } from './quick-transfer';
function quickFixture(scope: QuickScope = 'guest', values = new Map<string, string>()) {
  let fail = false;
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (fail) throw new Error('Quota exceeded');
      values.set(key, value);
    },
  };
  const store = new QuickLogStore(storage, scope, randomUUID);
  store.hydrate();
  return {
    store,
    storage,
    values,
    fail: (value: boolean) => {
      fail = value;
    },
    eligible: () => store.acknowledgeEligibility(),
  };
}

function receipt(operation: QuickTransfer): QuickReceipt {
  return {
    operationId: operation.id,
    accountId: operation.accountId,
    nightId: operation.nightId,
    memberId: operation.memberId,
    entries: operation.entries.map((e) => ({
      sourceEntryId: e.id,
      revision: e.revision,
      destinationEntryId: randomUUID(),
    })),
  };
}
function setup() {
  const f = quickFixture();
  f.eligible();
  f.store.log('drink');
  f.store.log('shot');
  const account = randomUUID();
  const operation = f.store.prepareTransfer(
    f.store.session()!.id,
    account,
    randomUUID(),
    randomUUID(),
  );
  return { ...f, account, operation };
}
describe('explicit Quick Log transfer', () => {
  it('keeps a source frozen after a gateway permission error or a conflict that cannot rule out an earlier commit', async () => {
    const f = setup();
    for (const error of [
      Object.assign(new Error('permission denied for function import_quick_log'), {
        code: '42501',
      }),
      Object.assign(new Error('These source entries were already added to a night.'), {
        code: '23505',
      }),
    ]) {
      await expect(
        executeQuickTransfer(
          f.store,
          f.operation,
          () => f.account,
          true,
          () => Promise.reject(error),
        ),
      ).rejects.toBe(error);
      expect(f.store.getSnapshot().record.operations[0]?.state).toBe('uncertain');
      expect(() =>
        f.store.correct(f.operation.sessionId, f.operation.entries[0]!.id, 'remove'),
      ).toThrow('read-only');
    }
    expect(() => {
      f.operation.entries[0]!.kind = 'shot';
    }).toThrow();
  });
  it('requires local persistence, connectivity and the initiating account before making a request', async () => {
    const f = setup(),
      request = vi.fn();
    await expect(
      executeQuickTransfer(f.store, f.operation, () => f.account, false, request),
    ).rejects.toThrow('online');
    await expect(
      executeQuickTransfer(f.store, f.operation, () => randomUUID(), true, request),
    ).rejects.toThrow('account');
    f.fail(true);
    f.store.log('drink');
    await expect(
      executeQuickTransfer(f.store, f.operation, () => f.account, true, request),
    ).rejects.toThrow('device');
    expect(request).not.toHaveBeenCalled();
  });
  it('persists the immutable batch before requesting; new taps stay outside it and source corrections are locked', async () => {
    const f = setup();
    let resolve!: (value: QuickReceipt) => void;
    const request = vi.fn(
      () =>
        new Promise<QuickReceipt>((done) => {
          resolve = done;
        }),
    );
    const result = executeQuickTransfer(f.store, f.operation, () => f.account, true, request);
    expect(() =>
      f.store.correct(f.operation.sessionId, f.operation.entries[0]!.id, 'remove'),
    ).toThrow('read-only');
    expect(() => f.store.deleteSession(f.operation.sessionId)).toThrow();
    f.store.log('shot');
    expect(f.operation.entries).toHaveLength(2);
    resolve(receipt(f.operation));
    await result;
    expect(availableQuickEntries(f.store.session())).toHaveLength(1);
    expect(f.store.session()!.entries.at(-1)?.destination).toBeNull();
    expect(f.store.session()!.state).toBe('active');
  });
  it('rejects duplicate UI submission and reconciles server commit/response-loss after restart with the same operation', async () => {
    const f = setup();
    const committed = receipt(f.operation);
    let release!: () => void;
    const first = executeQuickTransfer(
      f.store,
      f.operation,
      () => f.account,
      true,
      () =>
        new Promise<QuickReceipt>((_, reject) => {
          release = () => reject(new Error('Response lost'));
        }),
    );
    await expect(
      executeQuickTransfer(f.store, f.operation, () => f.account, true, vi.fn()),
    ).rejects.toThrow('already');
    release();
    await expect(first).rejects.toThrow('Response lost');
    const restarted = new QuickLogStore(f.storage, 'guest', randomUUID);
    restarted.hydrate();
    const restored = restarted.getSnapshot().record.operations[0]!;
    expect(restored.id).toBe(f.operation.id);
    expect(restored.entries).toEqual(f.operation.entries);
    expect(restored.state).toBe('uncertain');
    const duplicate = await executeQuickTransfer(
      restarted,
      restored,
      () => f.account,
      true,
      () => Promise.resolve(committed),
    );
    expect(duplicate).toEqual(committed);
    expect(availableQuickEntries(restarted.session())).toHaveLength(0);
    expect(() => restarted.correct(restored.sessionId, restored.entries[0]!.id, 'drink')).toThrow(
      'read-only',
    );
  });
  it('never confirms unexpected receipts, a changed destination or the wrong account', async () => {
    const f = setup();
    expect(() =>
      f.store.prepareTransfer(
        f.operation.sessionId,
        randomUUID(),
        f.operation.nightId,
        f.operation.memberId,
      ),
    ).toThrow();
    await expect(
      executeQuickTransfer(
        f.store,
        f.operation,
        () => f.account,
        true,
        () => Promise.resolve({ ...receipt(f.operation), nightId: randomUUID() }),
      ),
    ).rejects.toThrow('unexpected');
    expect(availableQuickEntries(f.store.session())).toHaveLength(2);
    let current: string | null = f.account;
    await expect(
      executeQuickTransfer(
        f.store,
        f.operation,
        () => current,
        true,
        () => {
          current = null;
          return Promise.resolve(receipt(f.operation));
        },
      ),
    ).rejects.toThrow('account');
    expect(f.store.getSnapshot().record.operations[0]?.state).toBe('uncertain');
  });
  it('keeps guest intent unchanged after sign-in cancellation and blocks account-owned transfer under another identity', () => {
    const f = quickFixture();
    f.eligible();
    f.store.log('shot');
    const id = f.store.session()!.id;
    f.store.setIntent({ sessionId: id, accountId: null, nightId: null, destination: 'choose' });
    const restored = quickFixture('guest', f.values).store;
    expect(restored.getSnapshot().record.intent?.sessionId).toBe(id);
    expect(availableQuickEntries(restored.session())).toHaveLength(1);
    const own = quickFixture(quickScope(randomUUID()));
    own.eligible();
    own.store.log('drink');
    expect(() =>
      own.store.prepareTransfer(own.store.session()!.id, randomUUID(), randomUUID(), randomUUID()),
    ).toThrow('account');
  });
  it.each([
    { code: '42501', message: 'Add logs to your own participant record.' },
    {
      code: '40001',
      message: 'This Quick Log entry changed on another device. Review your entries.',
    },
  ])(
    'unfreezes sources after a definitive $code rejection, preserving the entries',
    async ({ code, message }) => {
      const f = setup();
      await expect(
        executeQuickTransfer(
          f.store,
          f.operation,
          () => f.account,
          true,
          () => Promise.reject(Object.assign(new Error(message), { code })),
        ),
      ).rejects.toMatchObject({ code });
      expect(f.store.getSnapshot().record.operations[0]?.state).toBe('rejected');
      expect(() =>
        f.store.correct(f.operation.sessionId, f.operation.entries[0]!.id, 'shot'),
      ).not.toThrow();
    },
  );
});
