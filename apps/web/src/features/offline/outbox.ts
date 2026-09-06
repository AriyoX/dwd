import type { PendingDrinkLog, PendingLogStore } from '@dwd/contracts';
import type { DrinkLogResult, WaterLogResult } from '@dwd/core';

export type PendingSendResult = DrinkLogResult | WaterLogResult;
export type SuccessfulPendingSendResult = Extract<
  PendingSendResult,
  { status: 'created' | 'duplicate' }
>;

export interface PendingActivitySender {
  send: (record: PendingDrinkLog) => Promise<PendingSendResult>;
  resolveAlcohol: (idempotencyKey: string) => Promise<DrinkLogResult | null>;
  softDelete: (logId: string, kind: 'alcohol' | 'water') => Promise<boolean>;
}

export type SyncOutcome =
  | { status: 'synced'; result: SuccessfulPendingSendResult }
  | { status: 'needs_confirmation'; warnings: ('plan_exceeded' | 'after_end')[] }
  | { status: 'retryable_failure'; message: string }
  | { status: 'permanent_failure'; message: string }
  | { status: 'skipped' };

export class OutboxCoordinator {
  public constructor(
    private readonly store: PendingLogStore,
    private readonly sender: PendingActivitySender,
  ) {}

  public async enqueue(record: PendingDrinkLog, syncNow: boolean): Promise<SyncOutcome> {
    await this.store.save(record);
    return syncNow ? this.syncOne(record.idempotencyKey) : { status: 'skipped' };
  }

  public async syncOne(idempotencyKey: string, force = false): Promise<SyncOutcome> {
    const record = (await this.store.getAll()).find(
      (item) => item.idempotencyKey === idempotencyKey,
    );
    if (record === undefined) return { status: 'skipped' };
    if (
      !force &&
      (record.status === 'needs_confirmation' || record.status === 'permanent_failure')
    ) {
      return { status: 'skipped' };
    }

    await this.store.update(idempotencyKey, { status: 'syncing' });
    try {
      const result = await this.sender.send(record);
      if (result.status === 'created' || result.status === 'duplicate') {
        await this.store.remove(idempotencyKey);
        return { status: 'synced', result };
      }
      if (result.status === 'confirmation_required') {
        await this.store.update(idempotencyKey, {
          status: 'needs_confirmation',
          requiredWarnings: result.warnings,
          lastError: result.message,
        });
        return { status: 'needs_confirmation', warnings: result.warnings };
      }
      if (result.status === 'permanently_rejected') {
        await this.store.markFailed(idempotencyKey, result.message, true);
        return { status: 'permanent_failure', message: result.message };
      }
      await this.store.markFailed(idempotencyKey, result.message);
      return { status: 'retryable_failure', message: result.message };
    } catch {
      const message = 'Connection interrupted. This entry remains queued.';
      await this.store.markFailed(idempotencyKey, message);
      return { status: 'retryable_failure', message };
    }
  }

  public async retryAll(
    shouldRetry: (record: PendingDrinkLog) => boolean = () => true,
  ): Promise<SyncOutcome[]> {
    const retryable = (await this.store.getAll()).filter(
      (record) =>
        shouldRetry(record) &&
        (record.status === 'pending' || record.status === 'failed' || record.status === 'syncing'),
    );
    const outcomes: SyncOutcome[] = [];
    for (const record of retryable) outcomes.push(await this.syncOne(record.idempotencyKey, true));
    return outcomes;
  }

  public async confirmAndRetry(
    idempotencyKey: string,
    warnings: readonly ('plan_exceeded' | 'after_end')[],
  ): Promise<SyncOutcome> {
    await this.store.update(idempotencyKey, {
      status: 'pending',
      acknowledgePlanExceeded: warnings.includes('plan_exceeded'),
      acknowledgeAfterEnd: warnings.includes('after_end'),
      requiredWarnings: [...warnings],
      lastError: undefined,
    });
    return this.syncOne(idempotencyKey, true);
  }

  public async remove(idempotencyKey: string): Promise<void> {
    await this.store.remove(idempotencyKey);
  }

  public async undo(
    idempotencyKey: string,
  ): Promise<'pending_removed' | 'server_deleted' | 'not_found'> {
    const pending = (await this.store.getAll()).find(
      (record) => record.idempotencyKey === idempotencyKey,
    );
    if (pending !== undefined && pending.status !== 'syncing') {
      await this.store.remove(idempotencyKey);
      return 'pending_removed';
    }
    if (pending !== undefined) {
      try {
        const result = await this.sender.send(pending);
        if (result.status === 'created' || result.status === 'duplicate') {
          const deleted = await this.sender.softDelete(result.log.id, pending.kind);
          await this.store.remove(idempotencyKey);
          return deleted ? 'server_deleted' : 'not_found';
        }
      } catch {
        // Resolve an alcohol row below; a later idempotent retry remains safe.
      }
    }
    const canonical = await this.sender.resolveAlcohol(idempotencyKey);
    if (
      canonical === null ||
      (canonical.status !== 'created' && canonical.status !== 'duplicate')
    ) {
      if (pending !== undefined) await this.store.remove(idempotencyKey);
      return pending === undefined ? 'not_found' : 'pending_removed';
    }
    const deleted = await this.sender.softDelete(canonical.log.id, 'alcohol');
    if (pending !== undefined) await this.store.remove(idempotencyKey);
    return deleted ? 'server_deleted' : 'not_found';
  }
}
