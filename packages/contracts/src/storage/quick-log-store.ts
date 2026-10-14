import {
  availableQuickEntries,
  emptyQuickRecord,
  parseQuickRecord,
  quickEntryLocked,
  quickReceiptSchema,
  quickScope,
  quickSessionSchema,
  quickSyncFingerprint,
  compareQuickEntries,
  unresolvedQuickTransfers,
  type QuickEntry,
  type QuickIntent,
  type QuickKind,
  type QuickReceipt,
  type QuickRecord,
  type QuickScope,
  type QuickSession,
  type QuickTransfer,
} from '@dwd/core';

export const quickRecordKey = (scope: QuickScope) => `dwd.quick-log.v1:${scope}`;
export interface QuickStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  /** Native SQLite uses its transactional update callback; browser callers must hold a Web Lock. */
  updateItem?(key: string, update: (previous: string | null) => string): void;
}
export interface QuickStoreState {
  record: QuickRecord;
  hydrated: boolean;
  saved: boolean;
  issue: string | null;
  recoveryRaw: string | null;
  blocked: boolean;
}
export interface QuickUndo {
  entryId: string;
  sessionId: string;
  revision: number;
  previous: Pick<QuickEntry, 'kind' | 'removedAt'> | null;
}

/** One record is the commit boundary: sessions, tombstones and transfer operations cannot split. */
export class QuickLogStore {
  private state: QuickStoreState;
  private listeners = new Set<() => void>();
  private baseline: string | null = null;
  private dirty = false;
  public constructor(
    private storage: QuickStorage,
    public readonly scope: QuickScope,
    private uuid: () => string,
    private now = () => new Date().toISOString(),
  ) {
    this.state = {
      record: emptyQuickRecord(scope),
      hydrated: false,
      saved: false,
      issue: null,
      recoveryRaw: null,
      blocked: false,
    };
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  reload() {
    // Never discard recoverable unsaved edits when returning from navigation.
    if (this.state.hydrated && this.dirty && !this.state.blocked) return;
    this.state = { ...this.state, hydrated: false };
    this.hydrate();
  }
  private emit() {
    for (const listener of this.listeners) listener();
  }
  hydrate() {
    if (this.state.hydrated && !this.state.blocked) return;
    let raw: string | null = null;
    try {
      raw = this.storage.getItem(quickRecordKey(this.scope));
      const record =
        raw === null ? emptyQuickRecord(this.scope) : parseQuickRecord(raw, this.scope);
      this.freezeSnapshots(record);
      this.baseline = raw;
      this.state = {
        record,
        hydrated: true,
        saved: raw !== null,
        issue: null,
        recoveryRaw: null,
        blocked: false,
      };
    } catch {
      this.state = {
        ...this.state,
        hydrated: true,
        saved: false,
        blocked: raw !== null,
        recoveryRaw: raw,
        issue:
          raw !== null
            ? 'Couldn’t read saved logs. The original data is kept for recovery.'
            : 'Couldn’t save on this device',
      };
    }
    this.emit();
  }
  private commit(record: QuickRecord) {
    if (!this.state.hydrated || this.state.blocked)
      throw new Error('Saved logs must be restored before editing.');
    this.freezeSnapshots(record);
    this.dirty = true;
    this.state = { ...this.state, record, saved: false };
    this.persist();
  }
  private freezeSnapshots(record: QuickRecord) {
    for (const operation of record.operations) {
      for (const entry of operation.entries) Object.freeze(entry);
      Object.freeze(operation.entries);
      Object.freeze(operation);
    }
  }
  retrySave() {
    if (this.state.blocked) this.hydrate();
    else this.persist();
  }
  private persist() {
    const raw = JSON.stringify(this.state.record);
    try {
      const update = (previous: string | null) => {
        if (previous !== this.baseline) throw new Error('Saved logs changed in another window.');
        return raw;
      };
      if (this.storage.updateItem) this.storage.updateItem(quickRecordKey(this.scope), update);
      else
        this.storage.setItem(
          quickRecordKey(this.scope),
          update(this.storage.getItem(quickRecordKey(this.scope))),
        );
      this.baseline = raw;
      this.dirty = false;
      this.state = { ...this.state, saved: true, issue: null };
    } catch {
      this.state = { ...this.state, saved: false, issue: 'Couldn’t save on this device' };
    }
    this.emit();
  }
  acknowledgeEligibility() {
    this.commit({ ...this.state.record, eligible: true });
  }
  session(id?: string | null) {
    return this.state.record.sessions.find(
      (s) => s.id === (id ?? this.state.record.activeSessionId),
    );
  }
  log(kind: QuickKind): QuickUndo {
    if (!this.state.record.eligible) throw new Error('Confirm the age requirement to log.');
    const at = this.now();
    const existing = this.session();
    if (this.scope === 'guest' && existing?.claimedBy)
      throw new Error(
        'This session belongs to an account. Sign in to resume it, or finish it to start a new guest session.',
      );
    const session: QuickSession = existing ?? {
      id: this.uuid(),
      schemaVersion: 3,
      scope: this.scope,
      claimedBy: this.scope === 'guest' ? null : this.scope.slice(8),
      createdAt: at,
      updatedAt: at,
      finishedAt: null,
      state: 'active',
      entries: [],
    };
    const entry: QuickEntry = {
      id: this.uuid(),
      sessionId: session.id,
      kind,
      recordedAt: at,
      sequence: session.entries.reduce((max, e) => Math.max(max, e.sequence), 0) + 1,
      revision: 1,
      updatedAt: at,
      removedAt: null,
      destination: null,
    };
    const next = { ...session, updatedAt: at, entries: [...session.entries, entry] };
    const action: QuickUndo = {
      entryId: entry.id,
      sessionId: session.id,
      revision: entry.revision,
      previous: null,
    };
    this.commit({
      ...this.state.record,
      undo: action,
      activeSessionId: session.id,
      sessions: existing
        ? this.state.record.sessions.map((s) => (s.id === session.id ? next : s))
        : [...this.state.record.sessions, next],
    });
    return action;
  }
  correct(sessionId: string, entryId: string, kind: QuickKind | 'remove'): QuickUndo {
    const session = this.session(sessionId);
    const entry = session?.entries.find((e) => e.id === entryId);
    if (
      !session ||
      !entry ||
      session.state !== 'active' ||
      quickEntryLocked(this.state.record, entry)
    )
      throw new Error('This entry is read-only.');
    const at = this.now();
    const updated = {
      ...entry,
      revision: entry.revision + 1,
      updatedAt: at,
      ...(kind === 'remove' ? { removedAt: at } : { kind }),
    };
    const action: QuickUndo = {
      entryId,
      sessionId,
      revision: updated.revision,
      previous: { kind: entry.kind, removedAt: entry.removedAt },
    };
    this.commit({
      ...this.state.record,
      undo: action,
      sessions: this.state.record.sessions.map((s) =>
        s.id === sessionId
          ? { ...s, updatedAt: at, entries: s.entries.map((e) => (e.id === entryId ? updated : e)) }
          : s,
      ),
    });
    return action;
  }
  undo(action: QuickUndo) {
    const session = this.session(action.sessionId);
    const entry = session?.entries.find((e) => e.id === action.entryId);
    if (
      !session ||
      session.state !== 'active' ||
      !entry ||
      entry.revision !== action.revision ||
      quickEntryLocked(this.state.record, entry)
    )
      throw new Error('This action can no longer be undone here.');
    const at = this.now();
    const updated = {
      ...entry,
      ...(action.previous ?? { removedAt: at }),
      revision: entry.revision + 1,
      updatedAt: at,
    };
    this.commit({
      ...this.state.record,
      undo: null,
      sessions: this.state.record.sessions.map((s) =>
        s.id === session.id
          ? {
              ...s,
              updatedAt: at,
              entries: s.entries.map((e) => (e.id === entry.id ? updated : e)),
            }
          : s,
      ),
    });
  }
  finish(sessionId: string) {
    const session = this.session(sessionId);
    if (!session || session.state === 'finished') return;
    const at = this.now();
    this.commit({
      ...this.state.record,
      undo: this.state.record.undo?.sessionId === sessionId ? null : this.state.record.undo,
      activeSessionId:
        this.state.record.activeSessionId === sessionId ? null : this.state.record.activeSessionId,
      sessions: this.state.record.sessions.map((s) =>
        s.id === sessionId ? { ...s, state: 'finished', finishedAt: at, updatedAt: at } : s,
      ),
    });
  }
  startNew() {
    const id = this.state.record.activeSessionId;
    if (id) this.finish(id);
  }
  reopen(sessionId: string) {
    const session = this.session(sessionId);
    if (
      !session ||
      !availableQuickEntries(session).length ||
      session.entries.some((e) => e.destination) ||
      unresolvedQuickTransfers(this.state.record).some((o) => o.sessionId === sessionId)
    )
      throw new Error('This session can’t be reopened.');
    if (this.state.record.activeSessionId && this.state.record.activeSessionId !== sessionId)
      throw new Error('Finish your current session before reopening this one.');
    this.commit({
      ...this.state.record,
      activeSessionId: sessionId,
      sessions: this.state.record.sessions.map((s) =>
        s.id === sessionId ? { ...s, state: 'active', finishedAt: null, updatedAt: this.now() } : s,
      ),
    });
  }
  deleteSession(sessionId: string) {
    if (unresolvedQuickTransfers(this.state.record).some((o) => o.sessionId === sessionId))
      throw new Error('Check the result of adding these logs before deleting this copy.');
    this.commit({
      ...this.state.record,
      undo: this.state.record.undo?.sessionId === sessionId ? null : this.state.record.undo,
      activeSessionId:
        this.state.record.activeSessionId === sessionId ? null : this.state.record.activeSessionId,
      sessions: this.state.record.sessions.filter((s) => s.id !== sessionId),
      operations: this.state.record.operations.filter((o) => o.sessionId !== sessionId),
      intent: this.state.record.intent?.sessionId === sessionId ? null : this.state.record.intent,
    });
  }
  setIntent(intent: QuickIntent | null) {
    this.commit({ ...this.state.record, intent });
  }
  prepareTransfer(
    sessionId: string,
    accountId: string,
    nightId: string,
    memberId: string,
  ): QuickTransfer {
    if (this.scope !== 'guest' && this.scope !== `account:${accountId}`)
      throw new Error('Use the account that owns these logs.');
    const claimed = this.session(sessionId)?.claimedBy;
    if (claimed && claimed !== accountId) throw new Error('Use the account that owns these logs.');
    const pending = unresolvedQuickTransfers(this.state.record).find(
      (o) => o.sessionId === sessionId,
    );
    if (pending) {
      if (
        pending.accountId !== accountId ||
        pending.nightId !== nightId ||
        pending.memberId !== memberId
      )
        throw new Error('Check the previous result using the account and night you chose.');
      return pending;
    }
    const entries = availableQuickEntries(this.session(sessionId))
      .slice(0, 500)
      .map((e) => ({
        id: e.id,
        sessionId: e.sessionId,
        kind: e.kind,
        recordedAt: e.recordedAt,
        sequence: e.sequence,
        revision: e.revision,
      }));
    if (!entries.length) throw new Error('No new entries to add.');
    const rejected = this.state.record.operations.find(
      (o) =>
        o.state === 'rejected' &&
        o.accountId === accountId &&
        o.nightId === nightId &&
        o.memberId === memberId &&
        JSON.stringify(o.entries) === JSON.stringify(entries),
    );
    if (rejected) {
      const retry = { ...rejected, state: 'prepared' as const };
      this.commit({
        ...this.state.record,
        operations: this.state.record.operations.map((o) => (o.id === retry.id ? retry : o)),
      });
      if (!this.state.saved) throw new Error('Save on this device before adding logs to a night.');
      return retry;
    }
    const operation: QuickTransfer = {
      id: this.uuid(),
      sessionId,
      accountId,
      nightId,
      memberId,
      createdAt: this.now(),
      entries,
      state: 'prepared',
      receipt: null,
    };
    this.commit({ ...this.state.record, operations: [...this.state.record.operations, operation] });
    if (!this.state.saved) throw new Error('Save on this device before adding logs to a night.');
    return operation;
  }
  transferUncertain(operationId: string) {
    this.commit({
      ...this.state.record,
      operations: this.state.record.operations.map((o) =>
        o.id === operationId && o.state !== 'confirmed' ? { ...o, state: 'uncertain' } : o,
      ),
    });
  }
  transferRejected(operationId: string) {
    this.commit({
      ...this.state.record,
      operations: this.state.record.operations.map((o) =>
        o.id === operationId && o.state !== 'confirmed' ? { ...o, state: 'rejected' } : o,
      ),
    });
  }
  confirmTransfer(operationId: string, value: QuickReceipt) {
    const receipt = quickReceiptSchema.parse(value);
    const operation = this.state.record.operations.find((o) => o.id === operationId);
    if (
      !operation ||
      receipt.operationId !== operationId ||
      receipt.accountId !== operation.accountId ||
      receipt.nightId !== operation.nightId ||
      receipt.memberId !== operation.memberId ||
      receipt.entries.length !== operation.entries.length ||
      operation.entries.some(
        (e) => !receipt.entries.some((r) => r.sourceEntryId === e.id && r.revision === e.revision),
      ) ||
      new Set(receipt.entries.map((e) => e.destinationEntryId)).size !== receipt.entries.length
    )
      throw new Error('The night returned an unexpected result. Keep these logs and try again.');
    this.commit({
      ...this.state.record,
      operations: this.state.record.operations.map((o) =>
        o.id === operationId ? { ...o, state: 'confirmed', receipt } : o,
      ),
      sessions: this.state.record.sessions.map((s) =>
        s.id === operation.sessionId
          ? {
              ...s,
              entries: s.entries.map((e) => {
                const ref = receipt.entries.find((r) => r.sourceEntryId === e.id);
                return ref
                  ? {
                      ...e,
                      destination: {
                        nightId: receipt.nightId,
                        memberId: receipt.memberId,
                        operationId,
                        entryId: ref.destinationEntryId,
                      },
                    }
                  : e;
              }),
            }
          : s,
      ),
    });
  }
  bindGuestSession(sessionId: string, accountId: string) {
    const session = this.session(sessionId);
    if (
      this.scope !== 'guest' ||
      !session ||
      (session.claimedBy && session.claimedBy !== accountId)
    )
      throw new Error('Use the account that owns these logs.');
    if (
      this.state.record.operations.some(
        (o) => o.sessionId === sessionId && o.accountId !== accountId,
      )
    )
      throw new Error('Use the account that started adding these logs.');
    if (session.claimedBy === accountId) return;
    this.commit({
      ...this.state.record,
      sessions: this.state.record.sessions.map((s) =>
        s.id === sessionId ? { ...s, claimedBy: accountId } : s,
      ),
    });
  }
  /** Copy before retiring the guest source. Replaying after either write fails is safe. */
  adoptGuestSession(source: QuickSession, guest: QuickRecord, accountId: string) {
    if (this.scope !== quickScope(accountId) || source.claimedBy !== accountId)
      throw new Error('Use the account that owns these logs.');
    this.mergeAccountSession({ ...source, scope: this.scope }, true);
    const operations = guest.operations.filter(
      (o) => o.sessionId === source.id && o.accountId === accountId,
    );
    const record = this.state.record;
    const next = {
      ...record,
      eligible: record.eligible || guest.eligible,
      undo: guest.undo?.sessionId === source.id ? guest.undo : record.undo,
      intent:
        guest.intent?.sessionId === source.id &&
        (!guest.intent.accountId || guest.intent.accountId === accountId)
          ? { ...guest.intent, accountId }
          : record.intent,
      operations: [
        ...record.operations,
        ...operations.filter((o) => !record.operations.some((r) => r.id === o.id)),
      ],
    };
    if (JSON.stringify(next) !== JSON.stringify(record)) this.commit(next);
  }
  retireGuestSession(sessionId: string, accountId: string) {
    const source = this.session(sessionId);
    if (!source || source.claimedBy !== accountId)
      throw new Error('Use the account that owns these logs.');
    // The account copy keeps the original lifecycle and recording timestamps.
    this.finish(sessionId);
  }
  mergeAccountSession(value: QuickSession, preferActive = false) {
    const remote = quickSessionSchema.parse(value);
    if (
      this.scope === 'guest' ||
      remote.scope !== this.scope ||
      remote.claimedBy !== this.scope.slice(8)
    )
      throw new Error('Unexpected Quick Log account.');
    const local = this.session(remote.id);
    const dirty = local && this.state.record.synced[local.id] !== quickSyncFingerprint(local);
    const entries = new Map(remote.entries.map((e) => [e.id, e]));
    for (const entry of local?.entries ?? []) {
      const other = entries.get(entry.id);
      if (!other || quickEntryLocked(this.state.record, entry) || entry.revision >= other.revision)
        entries.set(entry.id, { ...entry, destination: other?.destination ?? entry.destination });
    }
    let merged = {
      ...(dirty ? local : remote),
      ...(!local ? remote : {}),
      entries: [...entries.values()].sort(compareQuickEntries),
    } as QuickSession;
    let activeSessionId = this.state.record.activeSessionId;
    const activate =
      merged.state === 'active' &&
      (!activeSessionId || activeSessionId === merged.id || preferActive);
    let sessions = this.state.record.sessions.filter((s) => s.id !== merged.id);
    if (activate) {
      if (activeSessionId && activeSessionId !== merged.id)
        sessions = sessions.map((s) =>
          s.id === activeSessionId
            ? {
                ...s,
                state: 'finished' as const,
                finishedAt: remote.updatedAt,
                updatedAt: remote.updatedAt,
              }
            : s,
        );
      activeSessionId = merged.id;
    } else if (merged.state === 'active')
      merged = { ...merged, state: 'finished', finishedAt: merged.updatedAt };
    else if (activeSessionId === merged.id) activeSessionId = null;
    const next = { ...this.state.record, activeSessionId, sessions: [...sessions, merged] };
    if (JSON.stringify(next) !== JSON.stringify(this.state.record)) this.commit(next);
  }
  markAccountSynced(sessionId: string, fingerprint: string) {
    if (this.state.record.synced[sessionId] === fingerprint) return;
    this.commit({
      ...this.state.record,
      synced: { ...this.state.record.synced, [sessionId]: fingerprint },
    });
  }
}
