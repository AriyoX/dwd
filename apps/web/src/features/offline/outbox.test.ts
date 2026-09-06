import { describe, expect, it, vi } from 'vitest';
import type { PendingDrinkLog, PendingLogStore } from '@dwd/contracts';
import type { DrinkLogResult } from '@dwd/core';
import { OutboxCoordinator, type PendingActivitySender } from './outbox';

describe('offline outbox', () => {
  it('removes a pending log after canonical success', async () => {
    const fixture = setup(created());
    await fixture.store.save(pending());
    expect((await fixture.outbox.syncOne('00000000-0000-4000-8000-000000000001')).status).toBe(
      'synced',
    );
    expect(await fixture.store.getAll()).toEqual([]);
  });

  it('keeps temporary failures retryable and retries on reconnection', async () => {
    const fixture = setup({ status: 'temporarily_failed', message: 'offline' });
    await fixture.store.save(pending());
    expect((await fixture.outbox.retryAll())[0]?.status).toBe('retryable_failure');
    expect((await fixture.store.getAll())[0]?.status).toBe('failed');
    fixture.sender.send = vi.fn().mockResolvedValue(created());
    await fixture.outbox.retryAll();
    expect(await fixture.store.getAll()).toEqual([]);
  });

  it('stops automatic retry after permanent rejection', async () => {
    const fixture = setup({
      status: 'permanently_rejected',
      code: 'grace_expired',
      message: 'expired',
    });
    await fixture.store.save(pending());
    await fixture.outbox.retryAll();
    expect((await fixture.store.getAll())[0]?.status).toBe('permanent_failure');
    await fixture.outbox.retryAll();
    expect(fixture.sender.send).toHaveBeenCalledTimes(1);
  });

  it('moves a newly required server warning to needs_confirmation', async () => {
    const fixture = setup({
      status: 'confirmation_required',
      warnings: ['after_end'],
      message: 'Confirm end time',
    });
    await fixture.store.save(pending());
    expect((await fixture.outbox.syncOne('00000000-0000-4000-8000-000000000001')).status).toBe(
      'needs_confirmation',
    );
    expect((await fixture.store.getAll())[0]?.status).toBe('needs_confirmation');
  });

  it('treats duplicate retries as success without double entries', async () => {
    const fixture = setup({ ...created(), status: 'duplicate' });
    await fixture.store.save(pending());
    await fixture.outbox.retryAll();
    await fixture.outbox.retryAll();
    expect(fixture.sender.send).toHaveBeenCalledTimes(1);
  });

  it('retries only records selected for the active account and night', async () => {
    const fixture = setup(created());
    await fixture.store.save(pending());
    await fixture.outbox.retryAll((record) => record.actorUserId.endsWith('9999'));
    expect(fixture.sender.send).not.toHaveBeenCalled();
    expect(await fixture.store.getAll()).toHaveLength(1);
  });

  it('undoes a local pending item before sync', async () => {
    const fixture = setup(created());
    await fixture.store.save(pending());
    expect(await fixture.outbox.undo('00000000-0000-4000-8000-000000000001')).toBe(
      'pending_removed',
    );
    expect(fixture.sender.softDelete).not.toHaveBeenCalled();
  });

  it('resolves and soft-deletes an already synced item', async () => {
    const fixture = setup(created());
    fixture.sender.resolveAlcohol = vi.fn().mockResolvedValue(created());
    expect(await fixture.outbox.undo('00000000-0000-4000-8000-000000000001')).toBe(
      'server_deleted',
    );
    expect(fixture.sender.softDelete).toHaveBeenCalledTimes(1);
  });
});

class MemoryStore implements PendingLogStore {
  public logs: PendingDrinkLog[] = [];
  public getAll() {
    return Promise.resolve(this.logs.map((log) => ({ ...log })));
  }
  public save(log: PendingDrinkLog) {
    this.logs = [...this.logs.filter((item) => item.idempotencyKey !== log.idempotencyKey), log];
    return Promise.resolve();
  }
  public remove(key: string) {
    this.logs = this.logs.filter((log) => log.idempotencyKey !== key);
    return Promise.resolve();
  }
  public update(key: string, patch: Partial<PendingDrinkLog>) {
    this.logs = this.logs.map((log) => (log.idempotencyKey === key ? { ...log, ...patch } : log));
    return Promise.resolve();
  }
  public async markFailed(key: string, reason: string, permanent = false) {
    await this.update(key, {
      status: permanent ? 'permanent_failure' : 'failed',
      lastError: reason,
      retryCount: 1,
    });
  }
  public clearForNight(nightId: string) {
    this.logs = this.logs.filter((log) => log.nightId !== nightId);
    return Promise.resolve();
  }
}

function setup(
  result: ReturnType<typeof created> | Exclude<DrinkLogResult, { status: 'created' | 'duplicate' }>,
) {
  const store = new MemoryStore();
  const sender: PendingActivitySender = {
    send: vi.fn().mockResolvedValue(result),
    resolveAlcohol: vi.fn().mockResolvedValue(null),
    softDelete: vi.fn().mockResolvedValue(true),
  };
  return { store, sender, outbox: new OutboxCoordinator(store, sender) };
}

function pending(): PendingDrinkLog {
  return {
    idempotencyKey: '00000000-0000-4000-8000-000000000001',
    kind: 'alcohol',
    actorUserId: '00000000-0000-4000-8000-000000000005',
    nightId: '00000000-0000-4000-8000-000000000010',
    nightMemberId: '00000000-0000-4000-8000-000000000020',
    memberDisplayName: 'Ari',
    planItemId: '00000000-0000-4000-8000-000000000030',
    planItemLabel: 'Beer',
    drinkSnapshot: { label: 'Beer', category: 'beer', volumeMl: 330, abvPercent: 5 },
    consumedAt: '2026-07-31T20:00:00Z',
    status: 'pending',
    retryCount: 0,
    acknowledgePlanExceeded: false,
    acknowledgeAfterEnd: false,
    createdLocallyAt: '2026-07-31T20:00:00Z',
  };
}

function created(): Extract<DrinkLogResult, { status: 'created' | 'duplicate' }> {
  return {
    status: 'created',
    alerts: [],
    log: {
      id: '00000000-0000-4000-8000-000000000040',
      nightId: '00000000-0000-4000-8000-000000000010',
      nightMemberId: '00000000-0000-4000-8000-000000000020',
      actorUserId: '00000000-0000-4000-8000-000000000050',
      planItemId: '00000000-0000-4000-8000-000000000030',
      labelSnapshot: 'Beer',
      categorySnapshot: 'beer',
      volumeMl: 330,
      abvPercent: 5,
      ethanolGrams: 13.019,
      consumedAt: '2026-07-31T20:00:00Z',
      createdAt: '2026-07-31T20:00:01Z',
      afterEnd: false,
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
      deletedAt: null,
    },
  };
}
