'use client';

import { z } from 'zod';
import type { PendingDrinkLog, PendingLogStore } from '@dwd/contracts';

const STORAGE_KEY = 'dwd:pending-logs:v1';
// Read the previous key only to preserve queued entries across the rename.
const LEGACY_STORAGE_KEY = 'drink-mates:pending-logs:v1';

const customDrinkSchema = z.object({
  label: z.string(),
  category: z.enum(['beer', 'wine', 'spirit', 'cocktail', 'other']),
  volumeMl: z.number(),
  abvPercent: z.number(),
});

const pendingLogSchema = z.object({
  idempotencyKey: z.uuid(),
  kind: z.enum(['alcohol', 'water']),
  actorUserId: z.uuid(),
  nightId: z.uuid(),
  nightMemberId: z.uuid(),
  memberDisplayName: z.string().max(60),
  planItemId: z.uuid().optional(),
  planItemLabel: z.string().max(60).optional(),
  drinkSnapshot: customDrinkSchema.optional(),
  customDrink: customDrinkSchema.optional(),
  consumedAt: z.string(),
  status: z.enum(['pending', 'syncing', 'needs_confirmation', 'failed', 'permanent_failure']),
  retryCount: z.number().int().nonnegative(),
  lastError: z.string().optional(),
  requiredWarnings: z.array(z.enum(['plan_exceeded', 'after_end'])).optional(),
  acknowledgePlanExceeded: z.boolean(),
  acknowledgeAfterEnd: z.boolean(),
  createdLocallyAt: z.string(),
});

export class BrowserPendingLogStore implements PendingLogStore {
  public getAll(): Promise<PendingDrinkLog[]> {
    if (typeof window === 'undefined') return Promise.resolve([]);
    try {
      const read = (key: string): PendingDrinkLog[] => {
        const raw = window.localStorage.getItem(key);
        if (raw === null) return [];
        try {
          const parsed: unknown = JSON.parse(raw);
          const result = z.array(pendingLogSchema).safeParse(parsed);
          return result.success ? result.data : [];
        } catch {
          return [];
        }
      };
      const previous = read(LEGACY_STORAGE_KEY);
      const current = read(STORAGE_KEY);
      const merged = [
        ...new Map([...previous, ...current].map((log) => [log.idempotencyKey, log])).values(),
      ];
      if (previous.length > 0) {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
          window.localStorage.removeItem(LEGACY_STORAGE_KEY);
        } catch {
          /* Leave old entries intact if this device cannot persist the migration. */
        }
      }
      return Promise.resolve(merged);
    } catch {
      return Promise.resolve([]);
    }
  }

  public async save(log: PendingDrinkLog): Promise<void> {
    const logs = await this.getAll();
    const existingIndex = logs.findIndex((item) => item.idempotencyKey === log.idempotencyKey);
    if (existingIndex === -1) logs.push(log);
    else logs[existingIndex] = log;
    this.write(logs);
  }

  public async remove(idempotencyKey: string): Promise<void> {
    this.write((await this.getAll()).filter((log) => log.idempotencyKey !== idempotencyKey));
  }

  public async update(idempotencyKey: string, patch: Partial<PendingDrinkLog>): Promise<void> {
    const logs = await this.getAll();
    const index = logs.findIndex((log) => log.idempotencyKey === idempotencyKey);
    if (index === -1 || logs[index] === undefined) return;
    logs[index] = { ...logs[index], ...patch };
    this.write(logs);
  }

  public async markFailed(
    idempotencyKey: string,
    reason: string,
    permanent = false,
  ): Promise<void> {
    const record = (await this.getAll()).find((log) => log.idempotencyKey === idempotencyKey);
    await this.update(idempotencyKey, {
      status: permanent ? 'permanent_failure' : 'failed',
      lastError: reason,
      retryCount: (record?.retryCount ?? 0) + 1,
    });
  }

  public async clearForNight(nightId: string): Promise<void> {
    this.write((await this.getAll()).filter((log) => log.nightId !== nightId));
  }

  private write(logs: readonly PendingDrinkLog[]): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  }
}
