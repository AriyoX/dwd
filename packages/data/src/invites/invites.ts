import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Database,
  InvitationPreview,
  InviteCreationResult,
  InviteRedemptionResult,
} from '@dwd/core';
import { unwrapRpc } from '../shared/rpc';

export async function createNightInvite(
  client: SupabaseClient<Database>,
  input: {
    nightId: string;
    tokenHash: string;
    expiresAt: string;
    maxUses: number | null;
  },
): Promise<InviteCreationResult> {
  const { data, error } = await client.rpc('create_night_invite', {
    p_night_id: input.nightId,
    p_token_hash: input.tokenHash,
    p_expires_at: input.expiresAt,
    ...(input.maxUses === null ? {} : { p_max_uses: input.maxUses }),
  });
  return unwrapRpc<InviteCreationResult>(data, error);
}

export async function rotateNightInvite(
  client: SupabaseClient<Database>,
  input: {
    nightId: string;
    tokenHash: string;
    expiresAt: string;
    maxUses: number | null;
  },
): Promise<InviteCreationResult> {
  const { data, error } = await client.rpc('rotate_night_invite', {
    p_night_id: input.nightId,
    p_token_hash: input.tokenHash,
    p_expires_at: input.expiresAt,
    ...(input.maxUses === null ? {} : { p_max_uses: input.maxUses }),
  });
  return unwrapRpc<InviteCreationResult>(data, error);
}

export async function revokeNightInvite(
  client: SupabaseClient<Database>,
  nightId: string,
): Promise<void> {
  const { data, error } = await client.rpc('revoke_night_invite', { p_night_id: nightId });
  unwrapRpc<{ revoked: boolean }>(data, error);
}

export async function getInvitePreview(
  client: SupabaseClient<Database>,
  tokenHash: string,
): Promise<InvitationPreview> {
  const { data, error } = await client.rpc('get_invite_preview', { p_token_hash: tokenHash });
  return unwrapRpc<InvitationPreview>(data, error);
}

export async function redeemNightInvite(
  client: SupabaseClient<Database>,
  tokenHash: string,
): Promise<InviteRedemptionResult> {
  const { data, error } = await client.rpc('redeem_night_invite', { p_token_hash: tokenHash });
  return unwrapRpc<InviteRedemptionResult>(data, error);
}
