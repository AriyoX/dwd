import { z } from 'zod';

export const QUICK_LOG_VERSION = 3;
export const QUICK_LOG_STALE_MS = 12 * 60 * 60 * 1000;
export const QUICK_LOG_RETENTION =
  'Clearing app or browser data, or uninstalling, can remove logs that haven’t been added to a night. Other devices, browsers, and the DWD app keep separate logs.';
export const QUICK_LOG_AMOUNTS = 'Counts only; drink sizes and strength aren’t recorded.';
export type QuickScope = 'guest' | `account:${string}`;
export const quickScope = (accountId?: string | null): QuickScope =>
  accountId ? `account:${accountId}` : 'guest';
const timestamp = z.iso.datetime({ offset: true });
const scopeSchema = z.union([z.literal('guest'), z.templateLiteral(['account:', z.uuid()])]);
const referenceSchema = z
  .object({ nightId: z.uuid(), memberId: z.uuid(), entryId: z.uuid(), operationId: z.uuid() })
  .strict();
export const quickEntrySchema = z
  .object({
    id: z.uuid(),
    sessionId: z.uuid(),
    kind: z.enum(['drink', 'shot', 'chaser']),
    recordedAt: timestamp,
    sequence: z.number().int().positive(),
    revision: z.number().int().positive(),
    updatedAt: timestamp,
    removedAt: timestamp.nullable(),
    destination: referenceSchema.nullable(),
  })
  .strict();
export type QuickEntry = z.infer<typeof quickEntrySchema>;
export type QuickKind = QuickEntry['kind'];
/** Legacy shots retain their source identity, but count and display as drinks. */
export const quickKindLabel = (kind: QuickKind) => (kind === 'chaser' ? 'Chaser' : 'Drink');
export const quickCorrectionKind = (kind: QuickKind): QuickKind =>
  kind === 'chaser' ? 'drink' : 'chaser';
export const quickSessionSchema = z
  .object({
    id: z.uuid(),
    schemaVersion: z.literal(3),
    scope: scopeSchema,
    createdAt: timestamp,
    updatedAt: timestamp,
    finishedAt: timestamp.nullable(),
    state: z.enum(['active', 'finished']),
    entries: z.array(quickEntrySchema),
  })
  .strict();
export type QuickSession = z.infer<typeof quickSessionSchema>;
const snapshotEntrySchema = quickEntrySchema.pick({
  id: true,
  sessionId: true,
  kind: true,
  recordedAt: true,
  sequence: true,
  revision: true,
});
export const quickReceiptSchema = z
  .object({
    operationId: z.uuid(),
    accountId: z.uuid(),
    nightId: z.uuid(),
    memberId: z.uuid(),
    entries: z
      .array(
        z
          .object({
            sourceEntryId: z.uuid(),
            destinationEntryId: z.uuid(),
            revision: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();
export type QuickReceipt = z.infer<typeof quickReceiptSchema>;
export const quickTransferSchema = z
  .object({
    id: z.uuid(),
    sessionId: z.uuid(),
    accountId: z.uuid(),
    nightId: z.uuid(),
    memberId: z.uuid(),
    createdAt: timestamp,
    entries: z.array(snapshotEntrySchema).min(1).max(500),
    state: z.enum(['prepared', 'uncertain', 'confirmed', 'rejected']),
    receipt: quickReceiptSchema.nullable(),
  })
  .strict();
export type QuickTransfer = z.infer<typeof quickTransferSchema>;
export const quickIntentSchema = z
  .object({
    sessionId: z.uuid(),
    accountId: z.uuid().nullable(),
    nightId: z.uuid().nullable(),
    destination: z.enum(['choose', 'invite', 'create']),
  })
  .strict();
export type QuickIntent = z.infer<typeof quickIntentSchema>;
const undoSchema = z
  .object({
    entryId: z.uuid(),
    sessionId: z.uuid(),
    revision: z.number().int().positive(),
    previous: quickEntrySchema.pick({ kind: true, removedAt: true }).nullable(),
  })
  .strict();
export const quickRecordSchema = z
  .object({
    version: z.literal(3),
    scope: scopeSchema,
    eligible: z.boolean(),
    activeSessionId: z.uuid().nullable(),
    undo: undoSchema.nullable().default(null),
    sessions: z.array(quickSessionSchema),
    operations: z.array(quickTransferSchema),
    intent: quickIntentSchema.nullable(),
  })
  .strict()
  .superRefine((record, ctx) => {
    const ids = new Set<string>();
    const active = record.sessions.filter((s) => s.state === 'active');
    if (active.length > 1 || (active[0]?.id ?? null) !== record.activeSessionId)
      ctx.addIssue({ code: 'custom', message: 'Invalid active session.' });
    for (const session of record.sessions) {
      if (
        ids.has(session.id) ||
        session.scope !== record.scope ||
        (session.state === 'active') !== (session.finishedAt === null)
      )
        ctx.addIssue({ code: 'custom', message: 'Invalid session identity.' });
      ids.add(session.id);
      const sequences = new Set<number>();
      for (const entry of session.entries) {
        if (ids.has(entry.id) || entry.sessionId !== session.id || sequences.has(entry.sequence))
          ctx.addIssue({ code: 'custom', message: 'Invalid entry identity/order.' });
        ids.add(entry.id);
        sequences.add(entry.sequence);
      }
    }
    const operationIds = new Set<string>();
    for (const operation of record.operations) {
      const session = record.sessions.find((s) => s.id === operation.sessionId);
      if (
        !session ||
        operationIds.has(operation.id) ||
        (record.scope !== 'guest' && record.scope !== quickScope(operation.accountId))
      )
        ctx.addIssue({ code: 'custom', message: 'Invalid transfer owner.' });
      operationIds.add(operation.id);
      const sources = new Set<string>();
      for (const entry of operation.entries) {
        if (
          entry.sessionId !== operation.sessionId ||
          !session?.entries.some((e) => e.id === entry.id) ||
          sources.has(entry.id)
        )
          ctx.addIssue({ code: 'custom', message: 'Invalid transfer snapshot.' });
        sources.add(entry.id);
        const local = session?.entries.find((e) => e.id === entry.id);
        if (
          (operation.state === 'prepared' ||
            operation.state === 'uncertain' ||
            operation.state === 'confirmed') &&
          local &&
          (local.revision !== entry.revision ||
            local.kind !== entry.kind ||
            local.recordedAt !== entry.recordedAt ||
            local.removedAt !== null)
        )
          ctx.addIssue({ code: 'custom', message: 'An unresolved source revision changed.' });
      }
      if (
        operation.state === 'confirmed' &&
        (!operation.receipt ||
          operation.receipt.operationId !== operation.id ||
          operation.receipt.accountId !== operation.accountId ||
          operation.receipt.nightId !== operation.nightId ||
          operation.receipt.memberId !== operation.memberId ||
          operation.receipt.entries.length !== operation.entries.length)
      )
        ctx.addIssue({ code: 'custom', message: 'Invalid transfer receipt.' });
    }
    if (record.intent && !record.sessions.some((s) => s.id === record.intent?.sessionId))
      ctx.addIssue({ code: 'custom', message: 'Invalid destination intent.' });
  });
export type QuickRecord = z.infer<typeof quickRecordSchema>;

export function emptyQuickRecord(scope: QuickScope): QuickRecord {
  return {
    version: 3,
    scope,
    eligible: false,
    activeSessionId: null,
    undo: null,
    sessions: [],
    operations: [],
    intent: null,
  };
}

/** The first release of the local record had no transfer metadata. Preserve every entry on upgrade. */
export function parseQuickRecord(raw: string, scope: QuickScope): QuickRecord {
  let value: unknown = JSON.parse(raw);
  if (value && typeof value === 'object' && 'version' in value && value.version === 1) {
    const legacy = z
      .object({
        version: z.literal(1),
        scope: scopeSchema,
        eligible: z.boolean().optional(),
        activeSessionId: z.uuid().nullable(),
        sessions: z.array(
          z
            .object({
              id: z.uuid(),
              scope: scopeSchema,
              createdAt: timestamp,
              updatedAt: timestamp,
              finishedAt: timestamp.nullable(),
              state: z.enum(['active', 'finished']),
              entries: z.array(
                z
                  .object({
                    id: z.uuid(),
                    sessionId: z.uuid(),
                    kind: z.enum(['drink', 'shot']),
                    recordedAt: timestamp,
                    sequence: z.number().int().positive(),
                  })
                  .strict(),
              ),
            })
            .strict(),
        ),
      })
      .strict()
      .parse(value);
    value = {
      ...legacy,
      version: 2,
      eligible: legacy.eligible ?? false,
      operations: [],
      intent: null,
      sessions: legacy.sessions.map((s) => ({
        ...s,
        schemaVersion: 2,
        entries: s.entries.map((e) => ({
          ...e,
          revision: 1,
          updatedAt: e.recordedAt,
          removedAt: null,
          destination: null,
        })),
      })),
    };
  }
  // Keep entry kinds and immutable transfer payloads unchanged: a pending legacy
  // shot import must still match its server receipt after upgrading.
  if (value && typeof value === 'object' && 'version' in value && value.version === 2) {
    const previous = value as { sessions?: unknown };
    value = {
      ...value,
      version: 3,
      sessions: Array.isArray(previous.sessions)
        ? previous.sessions.map((session: Record<string, unknown>) => ({
            ...session,
            schemaVersion: session['schemaVersion'] === 2 ? 3 : session['schemaVersion'],
          }))
        : previous.sessions,
    };
  }
  const record = quickRecordSchema.parse(value);
  if (record.scope !== scope) throw new Error('This record belongs to another local identity.');
  return record;
}

export function quickCounts(
  entries: readonly { kind: QuickKind; removedAt?: string | null; deletedAt?: string | null }[],
) {
  return entries.reduce(
    (counts, e) => {
      if (!e.removedAt && !e.deletedAt) counts[e.kind === 'chaser' ? 'chaser' : 'drink']++;
      return counts;
    },
    { drink: 0, chaser: 0 },
  );
}
export function quickCountLabel(entries: Parameters<typeof quickCounts>[0]) {
  const count = quickCounts(entries);
  return quickTotalsLabel(count.drink, count.chaser);
}
export function quickTotalsLabel(drinks: number, chasers: number) {
  return `${drinks} drink${drinks === 1 ? '' : 's'} · ${chasers} chaser${chasers === 1 ? '' : 's'}`;
}
export function availableQuickEntries(session?: QuickSession) {
  return (session?.entries ?? []).filter((e) => !e.removedAt && !e.destination);
}
export function unresolvedQuickTransfers(record: QuickRecord) {
  return record.operations.filter((o) => o.state === 'prepared' || o.state === 'uncertain');
}
export function quickEntryLocked(record: QuickRecord, entry: QuickEntry) {
  return Boolean(
    entry.destination ||
    unresolvedQuickTransfers(record).some((o) => o.entries.some((e) => e.id === entry.id)),
  );
}
export function isQuickSessionStale(session: QuickSession | undefined, now: number) {
  return Boolean(
    session &&
    session.state === 'active' &&
    now - Date.parse(session.updatedAt) >= QUICK_LOG_STALE_MS,
  );
}
export function quickRelativeTime(session: QuickSession | undefined, now: number) {
  const last = session?.entries
    .filter((e) => !e.removedAt)
    .sort((a, b) => b.sequence - a.sequence)[0];
  if (!last) return 'Tap to log your first drink.';
  const minutes = Math.max(0, Math.floor((now - Date.parse(last.recordedAt)) / 60_000));
  return minutes === 0
    ? 'Last logged just now'
    : minutes < 60
      ? `Last logged ${minutes} min ago`
      : `Last logged ${Math.floor(minutes / 60)} hr ago`;
}

/** Count-only night entries never enter the measured AlcoholLog collection. */
export interface NightQuickLog {
  id: string;
  nightId: string;
  nightMemberId: string;
  actorUserId: string | null;
  sourceSessionId: string;
  sourceEntryId: string;
  sourceRevision: number;
  sequence: number;
  kind: QuickKind;
  recordedAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  earlierLogging: boolean;
  volumeMl: null;
  abvPercent: null;
  ethanolGrams: null;
}
export function hasQuickLogs(logs: readonly Pick<NightQuickLog, 'deletedAt'>[] | undefined) {
  return Boolean(logs?.some((e) => !e.deletedAt));
}
export function hasUnknownAmounts(
  logs: readonly Pick<NightQuickLog, 'deletedAt' | 'kind'>[] | undefined,
) {
  return Boolean(logs?.some((e) => !e.deletedAt && e.kind !== 'chaser'));
}
