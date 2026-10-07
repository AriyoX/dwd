import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dwd/core';
import {
  createNightInvite,
  rotateNightInvite,
  revokeNightInviteOnce,
  getInvitePreview,
} from '@dwd/data';
import {
  completedInviteOperation,
  inviteStateKey,
  readInviteState,
  type InviteOperation,
  type InviteState,
} from './invite-state';
import { hashInvite, newInviteToken } from './invites';
import { withRequestTimeout } from './request-timeout';

type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;
const operations = new Map<string, Promise<InviteState>>();

export async function refreshNightInvite(
  storage: StorageAccess,
  client: SupabaseClient<Database>,
  owner: string,
  nightId: string,
  kind?: InviteOperation['kind'],
) {
  const state = await ensureNightInvite(storage, client, owner, nightId, kind);
  if (!state.token || state.pending || state.disabled) return state;
  const tokenHash = await hashInvite(state.token);
  const preview = await withRequestTimeout(() => getInvitePreview(client, tokenHash)).catch(
    () => null,
  );
  // A failed validation request must not discard a locally valid link.
  if (!preview || preview.valid) return state;
  const latest = readInviteState(storage, owner, nightId);
  if (latest.token !== state.token || latest.pending || latest.disabled) return latest;
  if (preview.reason === 'revoked' || preview.reason === 'ended') {
    const disabled = { ...state, token: null, expiresAt: null, disabled: true };
    storage.setItem(inviteStateKey(owner, nightId), JSON.stringify(disabled));
    return disabled;
  }
  // Expired, exhausted or missing links can be replaced without revoking other links.
  return ensureNightInvite(storage, client, owner, nightId, 'create');
}

// Persist identity before sending. A lost response, remount or concurrent screen
// resumes the same backend operation instead of minting another invitation.
export function ensureNightInvite(
  storage: StorageAccess,
  client: SupabaseClient<Database>,
  owner: string,
  nightId: string,
  kind?: InviteOperation['kind'],
) {
  const key = inviteStateKey(owner, nightId);
  const running = operations.get(key);
  if (running) return running;
  const work = async () => {
    let state: InviteState;
    try {
      state = readInviteState(storage, owner, nightId);
    } catch (error) {
      if (kind !== 'replace' && kind !== 'revoke') throw error;
      state = readInviteState({ getItem: () => null }, owner, nightId);
    }
    if (
      !kind &&
      !state.pending &&
      (state.disabled ||
        (state.token && state.expiresAt && Date.parse(state.expiresAt) > Date.now()))
    )
      return state;
    // An expired create/replace cannot produce a usable invitation. Keep an
    // unfinished revocation, but renew expired invitation delivery automatically.
    const pendingOperation =
      state.pending &&
      (state.pending.kind === 'revoke' || Date.parse(state.pending.expiresAt) > Date.now())
        ? state.pending
        : null;
    const operation = pendingOperation ?? {
      kind: kind ?? state.pending?.kind ?? 'create',
      token: await newInviteToken(),
      expiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
    };
    const pending = { ...state, pending: operation };
    storage.setItem(key, JSON.stringify(pending));
    const tokenHash = await hashInvite(operation.token);
    let expiresAt = operation.expiresAt;
    if (operation.kind === 'revoke')
      await withRequestTimeout(() => revokeNightInviteOnce(client, nightId, tokenHash));
    else {
      const input = { nightId, tokenHash, expiresAt, maxUses: null };
      const result = await withRequestTimeout(() =>
        operation.kind === 'replace'
          ? rotateNightInvite(client, input)
          : createNightInvite(client, input),
      );
      expiresAt = result.expiresAt;
    }
    const complete = completedInviteOperation(pending, operation, expiresAt);
    storage.setItem(key, JSON.stringify(complete));
    return complete;
  };
  const result = work();
  operations.set(key, result);
  void result
    .finally(() => {
      if (operations.get(key) === result) operations.delete(key);
    })
    .catch(() => undefined);
  return result;
}
