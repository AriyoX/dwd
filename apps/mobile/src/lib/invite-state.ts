import { z } from 'zod';
import { inviteTokenSchema } from '@dwd/core';

const operation = z.object({
  kind: z.enum(['create', 'replace', 'revoke']),
  token: inviteTokenSchema,
  expiresAt: z.iso.datetime(),
});
const stateSchema = z.object({
  owner: z.uuid(),
  nightId: z.uuid(),
  token: inviteTokenSchema.nullable(),
  expiresAt: z.iso.datetime().nullable(),
  pending: operation.nullable(),
});
export type InviteState = z.infer<typeof stateSchema>;
export type InviteOperation = z.infer<typeof operation>;
export const inviteStateKey = (owner: string, nightId: string) =>
  `dwd.mobile.invite.v1:${owner}:${nightId}`;
export function readInviteState(
  storage: Pick<Storage, 'getItem'>,
  owner: string,
  nightId: string,
): InviteState {
  const empty = { owner, nightId, token: null, expiresAt: null, pending: null };
  const raw = storage.getItem(inviteStateKey(owner, nightId));
  if (!raw) return empty;
  const parsed = stateSchema.safeParse(JSON.parse(raw));
  if (!parsed.success || parsed.data.owner !== owner || parsed.data.nightId !== nightId)
    throw new Error('Could not restore the invitation.');
  return parsed.data;
}
export function completedInviteOperation(
  state: InviteState,
  operation: InviteOperation,
  expiresAt = operation.expiresAt,
): InviteState {
  return {
    ...state,
    pending: null,
    token: operation.kind === 'revoke' ? null : operation.token,
    expiresAt: operation.kind === 'revoke' ? null : expiresAt,
  };
}
