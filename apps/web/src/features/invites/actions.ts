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
): Promise<InviteActionResult<{ url: string; expiresAt: string }>> {
  const parsed = createInviteSchema.safeParse({ nightId, expiresInHours: 24, maxUses: null });
  if (!parsed.success) return { ok: false, error: 'The night identifier is invalid.' };
  try {
    const client = await authenticatedClient();
    const rawToken = generateInviteToken();
    const expiresAt = new Date(
      Date.now() + parsed.data.expiresInHours * 60 * 60 * 1000,
    ).toISOString();
    const input = {
      nightId: parsed.data.nightId,
      tokenHash: hashInviteToken(rawToken),
      expiresAt,
      maxUses: parsed.data.maxUses,
    };
    if (rotate) await rotateNightInvite(client, input);
    else await createNightInvite(client, input);
    return { ok: true, data: { url: `${getSiteUrl()}/join/${rawToken}`, expiresAt } };
  } catch {
    return { ok: false, error: 'Only the active night host can create an invitation.' };
  }
}

export async function revokeInviteAction(nightId: string): Promise<InviteActionResult<undefined>> {
  try {
    const client = await authenticatedClient();
    await revokeNightInvite(client, nightId);
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
    return { ok: false, error: 'This invitation is unavailable or has expired.' };
  }
}

export async function previewInvite(rawToken: string): Promise<InvitationPreview> {
  const parsed = inviteTokenSchema.safeParse(rawToken);
  if (!parsed.success) return { valid: false, reason: 'invalid' };
  try {
    const client = await createServerSupabaseClient();
    return await getInvitePreview(client, hashInviteToken(parsed.data));
  } catch {
    return { valid: false, reason: 'invalid' };
  }
}
