import { z } from 'zod';
import { inviteTokenSchema } from '@dwd/core';

// Postgres JSON timestamps include an offset (+00:00); older saved links do too.
const inviteDate = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());
const operation = z.object({
  kind: z.enum(['create', 'replace', 'revoke']),
  token: inviteTokenSchema,
  expiresAt: inviteDate,
});
const stateSchema = z.object({
  owner: z.uuid(),
  nightId: z.uuid(),
  token: inviteTokenSchema.nullable(),
  expiresAt: inviteDate.nullable(),
  pending: operation.nullable(),
  disabled: z.boolean().default(false),
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
  const empty = { owner, nightId, token: null, expiresAt: null, pending: null, disabled: false };
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
    expiresAt: operation.kind === 'revoke' ? null : inviteDate.parse(expiresAt),
    disabled: operation.kind === 'revoke',
  };
}
