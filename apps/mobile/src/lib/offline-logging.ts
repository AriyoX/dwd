import { z } from 'zod';
import type { PendingDrinkLog } from '@dwd/contracts';
import { withRequestTimeout } from './request-timeout';
import { entryFailureMessage } from './entry-message';
import {
  calculateEthanolGrams,
  calculatePlanTotal,
  confirmationMessage,
  customDrinkSchema,
  determinePlanStatus,
  requiredLogConfirmations,
  type CustomDrinkInput,
  type AlcoholLog,
  type DrinkLogResult,
  type NightSnapshot,
  type WaterLogResult,
} from '@dwd/core';

type DeviceStorage = Pick<Storage, 'getItem' | 'setItem'>;
type Warning = 'plan_exceeded' | 'after_end';
export interface NativePendingLog extends PendingDrinkLog {
  // An attempted request may have reached the server even if its response was lost.
  attempted: boolean;
}
const pendingSchema = z
  .object({
    idempotencyKey: z.uuid(),
    actorUserId: z.uuid(),
    nightId: z.uuid(),
    nightMemberId: z.uuid(),
    memberDisplayName: z.string().max(60),
    kind: z.enum(['alcohol', 'water']),
    planItemId: z.uuid().optional(),
    planItemLabel: z.string().max(60).optional(),
    drinkSnapshot: customDrinkSchema.optional(),
    customDrink: customDrinkSchema.optional(),
    consumedAt: z.iso.datetime({ offset: true }),
    createdLocallyAt: z.iso.datetime({ offset: true }),
    status: z.enum(['pending', 'syncing', 'failed', 'needs_confirmation', 'permanent_failure']),
    retryCount: z.number().int().nonnegative(),
    lastError: z.string().optional(),
    requiredWarnings: z.array(z.enum(['plan_exceeded', 'after_end'])).optional(),
    acknowledgePlanExceeded: z.boolean(),
    acknowledgeAfterEnd: z.boolean(),
    attempted: z.boolean(),
  })
  .refine(
    (record) =>
      record.kind === 'water' ||
      (record.planItemId === undefined) !== (record.customDrink === undefined),
    'Choose a planned or custom drink.',
  );

export class NativePendingLogStore {
  private readonly key: string;
  public constructor(
    private readonly storage: DeviceStorage,
    public readonly actorUserId: string,
  ) {
    this.key = `dwd.mobile.pending-logs.v1:${actorUserId}`;
  }

  public getAll(): NativePendingLog[] {
    const raw = this.storage.getItem(this.key);
    if (raw === null) return [];
    // Do not replace unreadable data with an empty queue: report the storage problem.
    const records = z.array(pendingSchema).parse(JSON.parse(raw));
    if (records.some((record) => record.actorUserId !== this.actorUserId))
      throw new Error('This queue belongs to another account.');
    return records;
  }

  public save(record: NativePendingLog): void {
    const parsed = pendingSchema.parse(record);
    if (parsed.actorUserId !== this.actorUserId) throw new Error('Account changed.');
    const records = this.getAll();
    if (records.some((item) => item.idempotencyKey === record.idempotencyKey))
      throw new Error('This entry is already queued.');
    this.write([...records, parsed]);
  }

  public update(key: string, patch: Partial<NativePendingLog>): void {
    this.write(
      this.getAll().map((record) =>
        record.idempotencyKey === key
          ? pendingSchema.parse({
              ...record,
              ...patch,
              actorUserId: this.actorUserId,
              idempotencyKey: key,
            })
          : record,
      ),
    );
  }

  public remove(key: string): void {
    this.write(this.getAll().filter((record) => record.idempotencyKey !== key));
  }

  private write(records: NativePendingLog[]): void {
    // SQLite-backed localStorage is synchronous; a read/modify/write cannot interleave.
    this.storage.setItem(this.key, JSON.stringify(records));
  }
}

type SendResult = DrinkLogResult | WaterLogResult;
export type NativeSyncOutcome =
  'synced' | 'queued' | 'needs_confirmation' | 'rejected' | 'inactive';
const RETRY_MESSAGE = "We'll save this and sync it when you're back online.";

export class NativeLogOutbox {
  private active = true;
  // Bridge the interval between the write response and the next read snapshot.
  // Reads started after a write are authoritative, including an omitted/undone row.
  private revision = 0;
  private readonly accepted = new Map<
    string,
    { actor: string; revision: number; log: Extract<SendResult, { status: 'created' }>['log'] }
  >();
  private readonly inFlight = new Map<string, Promise<NativeSyncOutcome>>();
  private replay: Promise<void> | null = null;
  private readonly removing = new Set<string>();
  public constructor(
    public readonly store: NativePendingLogStore,
    private readonly sender: {
      current: () => boolean;
      send: (record: NativePendingLog, signal?: AbortSignal) => Promise<SendResult>;
      delete: (id: string, kind: 'alcohol' | 'water', signal?: AbortSignal) => Promise<void>;
    },
    private readonly changed: (synced: boolean) => void = () => undefined,
  ) {}

  public dispose(): void {
    this.active = false;
    this.accepted.clear();
  }
  public withAccepted(snapshot: NightSnapshot): NightSnapshot {
    const logs = [...this.accepted.values()].filter(
      ({ actor, log }) => actor === snapshot.currentUserId && log.nightId === snapshot.night.id,
    );
    if (!logs.length) return snapshot;
    return {
      ...snapshot,
      members: snapshot.members.map((member) => {
        const known = new Set(
          [...member.drinkLogs, ...member.waterLogs].map((log) => log.idempotencyKey),
        );
        const missing = logs
          .filter(({ log }) => log.nightMemberId === member.id && !known.has(log.idempotencyKey))
          .map(({ log }) => log);
        return {
          ...member,
          drinkLogs: [
            ...member.drinkLogs,
            ...missing.filter((log): log is AlcoholLog => 'ethanolGrams' in log),
          ],
          waterLogs: [...member.waterLogs, ...missing.filter((log) => !('ethanolGrams' in log))],
        };
      }),
    };
  }
  public acceptedVersion(): number {
    return this.revision;
  }
  public reconcileAccepted(snapshot: NightSnapshot, readVersion: number): void {
    for (const [key, entry] of this.accepted) {
      if (
        entry.actor === snapshot.currentUserId &&
        entry.log.nightId === snapshot.night.id &&
        entry.revision <= readVersion
      )
        this.accepted.delete(key);
    }
  }
  public current(): boolean {
    return this.active && this.sender.current();
  }
  public enqueue(record: NativePendingLog): void {
    if (!this.current()) throw new Error('Account changed.');
    if (record.drinkSnapshot?.sharedBottleId || record.customDrink?.sharedBottleId)
      throw new Error('Shared bottles require a connection.');
    this.store.save(record);
    this.changed(false);
  }

  public syncOne(key: string): Promise<NativeSyncOutcome> {
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    if (!this.current() || this.removing.has(key)) return Promise.resolve('inactive');
    const work = this.sendOne(key);
    this.inFlight.set(key, work);
    void work
      .finally(() => {
        if (this.inFlight.get(key) === work) this.inFlight.delete(key);
      })
      .catch(() => undefined);
    return work;
  }

  private async sendOne(key: string): Promise<NativeSyncOutcome> {
    try {
      const record = this.store.getAll().find((item) => item.idempotencyKey === key);
      if (
        !record ||
        record.status === 'needs_confirmation' ||
        record.status === 'permanent_failure'
      )
        return record?.status === 'needs_confirmation' ? 'needs_confirmation' : 'rejected';
      if (!this.current()) return 'inactive';
      this.store.update(key, { status: 'syncing', attempted: true });
      this.changed(false);
      if (!this.current()) return 'inactive';
      const result = await withRequestTimeout((signal) => this.sender.send(record, signal));
      if (!this.current()) return 'inactive';
      if (result.status === 'created' || result.status === 'duplicate') {
        this.accepted.set(key, {
          actor: record.actorUserId,
          revision: ++this.revision,
          log: result.log,
        });
        try {
          this.store.remove(key);
        } catch {
          /* Retry the same key later if cleanup fails; the server already accepted it. */
        }
        this.changed(true);
        return 'synced';
      }
      if (result.status === 'confirmation_required') {
        this.store.update(key, {
          status: 'needs_confirmation',
          requiredWarnings: result.warnings,
          lastError: result.message,
        });
        this.changed(false);
        return 'needs_confirmation';
      }
      this.store.update(key, {
        status: result.status === 'permanently_rejected' ? 'permanent_failure' : 'failed',
        retryCount: record.retryCount + 1,
        lastError:
          result.status === 'permanently_rejected'
            ? entryFailureMessage(result.code)
            : RETRY_MESSAGE,
      });
      this.changed(false);
      return result.status === 'permanently_rejected' ? 'rejected' : 'queued';
    } catch {
      if (!this.current()) return 'inactive';
      try {
        const record = this.store.getAll().find((item) => item.idempotencyKey === key);
        if (record)
          this.store.update(key, {
            status: 'failed',
            retryCount: record.retryCount + 1,
            lastError: RETRY_MESSAGE,
          });
      } catch {
        /* Leave the durable entry intact if storage cannot be updated. */
      }
      this.changed(false);
      return 'queued';
    }
  }

  public retryAll(): Promise<void> {
    if (this.replay) return this.replay;
    const work = this.replayAll();
    this.replay = work;
    void work
      .finally(() => {
        if (this.replay === work) this.replay = null;
      })
      .catch(() => undefined);
    return work;
  }

  private async replayAll(): Promise<void> {
    const records = this.store
      .getAll()
      .sort((a, b) => Date.parse(a.createdLocallyAt) - Date.parse(b.createdLocallyAt));
    // A successful read must clear a prior storage issue even if every entry is
    // waiting for review (or the queue is empty), so no send will publish state.
    if (!this.current()) return;
    this.changed(false);
    for (const record of records) {
      if (!this.current()) return;
      if (record.status === 'needs_confirmation' || record.status === 'permanent_failure') continue;
      const outcome = await this.syncOne(record.idempotencyKey);
      // One unavailable connection should not cause a request for every queued entry.
      if (outcome === 'queued' || outcome === 'inactive') return;
    }
  }

  public async confirm(key: string, send = true): Promise<NativeSyncOutcome> {
    if (!this.current()) return 'inactive';
    const record = this.store.getAll().find((item) => item.idempotencyKey === key);
    if (!record || record.status !== 'needs_confirmation') return 'inactive';
    const warnings = record.requiredWarnings ?? [];
    this.store.update(key, {
      status: 'pending',
      lastError: undefined,
      acknowledgePlanExceeded: record.acknowledgePlanExceeded || warnings.includes('plan_exceeded'),
      acknowledgeAfterEnd: record.acknowledgeAfterEnd || warnings.includes('after_end'),
    });
    this.changed(false);
    return send ? this.syncOne(key) : 'queued';
  }

  public async remove(key: string): Promise<void> {
    if (!this.current() || this.removing.has(key)) return;
    this.removing.add(key);
    try {
      await this.inFlight.get(key);
      if (!this.current()) return;
      const record = this.store.getAll().find((item) => item.idempotencyKey === key);
      // A concurrent sync may already have saved it. Refresh activity for its normal Undo action.
      if (!record) throw new Error('Entry saved. Open Entries to undo it.');
      if (
        record.attempted &&
        record.status !== 'needs_confirmation' &&
        record.status !== 'permanent_failure'
      ) {
        const result = await withRequestTimeout((signal) => this.sender.send(record, signal));
        if (!this.current()) return;
        if (result.status === 'created' || result.status === 'duplicate') {
          await withRequestTimeout((signal) =>
            this.sender.delete(result.log.id, record.kind, signal),
          );
          if (!this.current()) return;
          this.accepted.delete(key);
        } else if (result.status === 'temporarily_failed') {
          throw new Error('Connect to the internet so we can check and remove this entry.');
        }
      }
      this.store.remove(key);
      this.changed(true);
    } finally {
      this.removing.delete(key);
    }
  }
}

export function pendingForSnapshot(snapshot: NightSnapshot, records: readonly NativePendingLog[]) {
  const canonical = new Set(
    snapshot.members.flatMap((member) =>
      [...member.drinkLogs, ...member.waterLogs].map((log) => log.idempotencyKey),
    ),
  );
  return records.filter(
    (record) =>
      record.actorUserId === snapshot.currentUserId &&
      record.nightId === snapshot.night.id &&
      !canonical.has(record.idempotencyKey),
  );
}

export function makePendingLog(
  snapshot: NightSnapshot,
  targetMemberId: string,
  choice: { planItemId: string } | { customDrink: CustomDrinkInput } | 'water',
  records: readonly NativePendingLog[],
  key: string,
  consumedAt: string,
): NativePendingLog {
  const member = snapshot.members.find((item) => item.id === targetMemberId);
  if (!member) throw new Error('Participant unavailable.');
  const item =
    choice !== 'water' && 'planItemId' in choice
      ? member.planItems.find((plan) => plan.id === choice.planItemId && !plan.archivedAt)
      : undefined;
  const drink =
    choice === 'water' ? undefined : 'customDrink' in choice ? choice.customDrink : item;
  if (choice !== 'water' && !drink) throw new Error('Drink unavailable. Refresh your plan.');
  const waiting = pendingForSnapshot(snapshot, records).filter(
    (record) =>
      record.nightMemberId === targetMemberId &&
      record.kind === 'alcohol' &&
      record.status !== 'permanent_failure',
  );
  const grams =
    member.drinkLogs
      .filter((log) => !log.deletedAt)
      .reduce((sum, log) => sum + log.ethanolGrams, 0) +
    waiting.reduce(
      (sum, log) =>
        sum +
        (log.drinkSnapshot
          ? calculateEthanolGrams(log.drinkSnapshot.volumeMl, log.drinkSnapshot.abvPercent)
          : 0),
      0,
    );
  const warnings: Warning[] = drink
    ? requiredLogConfirmations(
        determinePlanStatus(
          grams + calculateEthanolGrams(drink.volumeMl, drink.abvPercent),
          calculatePlanTotal(member.planItems.filter((plan) => !plan.archivedAt)),
        ),
        Date.parse(consumedAt) > Date.parse(snapshot.night.endsAt),
      )
    : [];
  return pendingSchema.parse({
    idempotencyKey: key,
    actorUserId: snapshot.currentUserId,
    nightId: snapshot.night.id,
    nightMemberId: targetMemberId,
    memberDisplayName: member.displayName,
    kind: choice === 'water' ? 'water' : 'alcohol',
    ...(choice === 'water' ? {} : choice),
    ...(item ? { planItemLabel: item.label } : {}),
    ...(drink ? { drinkSnapshot: drink } : {}),
    consumedAt,
    createdLocallyAt: consumedAt,
    attempted: false,
    retryCount: 0,
    acknowledgePlanExceeded: false,
    acknowledgeAfterEnd: false,
    status: warnings.length ? 'needs_confirmation' : 'pending',
    ...(warnings.length
      ? { requiredWarnings: warnings, lastError: confirmationMessage(warnings) }
      : {}),
  });
}
