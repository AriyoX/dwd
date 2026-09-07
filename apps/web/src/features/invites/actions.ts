'use server';

import { headers } from 'next/headers';
import {
  createInviteSchema,
  inviteTokenSchema,
  type InvitationPreview,
  type InviteRedemptionResult,
} from '@dwd/core';
import {
  createNightInvite,
  getInvitePreview,
  redeemNightInvite,
  revokeNightInvite,
  rotateNightInvite,
} from '@dwd/data';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSiteUrl } from '@/lib/supabase/env';
import { generateInviteToken, hashInviteToken } from './token.server';
import { allowInviteLookup } from './rate-limit.server';

export type InviteActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function authenticatedClient() {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.auth.getClaims();
  if (error !== null || data?.claims.sub === undefined) throw new Error('Authentication required.');
  return client;
}

export async function createInviteAction(
  nightId: string,
  rotate = false,
  requestToken?: string,
): Promise<InviteActionResult<{ url: string; expiresAt: string }>> {
  const parsed = createInviteSchema.safeParse({ nightId, expiresInHours: 24, maxUses: null });
  if (!parsed.success) return { ok: false, error: 'The night identifier is invalid.' };
  if (requestToken !== undefined && !inviteTokenSchema.safeParse(requestToken).success)
    return { ok: false, error: 'The invitation request is invalid.' };
  try {
    const client = await authenticatedClient();
    const rawToken = requestToken ?? generateInviteToken();
    const expiresAt = new Date(
      Date.now() + parsed.data.expiresInHours * 60 * 60 * 1000,
    ).toISOString();
    const input = {
      nightId: parsed.data.nightId,
      tokenHash: hashInviteToken(rawToken),
      expiresAt,
      maxUses: parsed.data.maxUses,
    };
    const created = rotate
      ? await rotateNightInvite(client, input)
      : await createNightInvite(client, input);
    return {
      ok: true,
      data: { url: `${getSiteUrl()}/join/${rawToken}`, expiresAt: created.expiresAt },
    };
  } catch {
    return {
      ok: false,
      error:
        'Couldn’t create the link. Check your connection and retry. Only the current host of an active night can invite people.',
    };
  }
}

export async function revokeInviteAction(
  nightId: string,
  requestToken?: string,
): Promise<InviteActionResult<undefined>> {
  try {
    const client = await authenticatedClient();
    if (requestToken !== undefined) {
      if (!inviteTokenSchema.safeParse(requestToken).success)
        return { ok: false, error: 'Invalid invitation request.' };
      const { error } = await client.rpc('revoke_night_invite_once', {
        p_night_id: nightId,
        p_request_key: hashInviteToken(requestToken),
      });
      if (error) throw error;
    } else await revokeNightInvite(client, nightId);
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, error: 'The invitation could not be revoked.' };
  }
}

export async function redeemInviteAction(
  rawToken: string,
): Promise<InviteActionResult<InviteRedemptionResult>> {
  const parsed = inviteTokenSchema.safeParse(rawToken);
  if (!parsed.success) return { ok: false, error: 'This invitation is unavailable.' };
  try {
    const requestHeaders = await headers();
    const tokenHash = hashInviteToken(parsed.data);
    const rateKey = `redeem:${requestHeaders.get('x-forwarded-for') ?? 'local'}:${tokenHash.slice(0, 16)}`;
    if (!allowInviteLookup(rateKey))
      return { ok: false, error: 'Try this invitation again in a minute.' };
    const client = await authenticatedClient();
    const result = await redeemNightInvite(client, tokenHash);
    return { ok: true, data: result };
  } catch {
    return {
      ok: false,
      error:
        'Couldn’t join. Check your connection and retry. If the link has expired or been revoked, ask the host for a new one.',
    };
  }
}

export async function previewInvite(
  rawToken: string,
): Promise<InvitationPreview | { valid: false; reason: 'network' }> {
  const parsed = inviteTokenSchema.safeParse(rawToken);
  if (!parsed.success) return { valid: false, reason: 'invalid' };
  try {
    const client = await createServerSupabaseClient();
    return await getInvitePreview(client, hashInviteToken(parsed.data));
  } catch {
    return { valid: false, reason: 'network' };
  }
}
