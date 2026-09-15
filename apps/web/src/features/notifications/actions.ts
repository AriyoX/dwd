'use server';

import { z } from 'zod';
import {
  acknowledgeCheckIn,
  acknowledgeNotification,
  registerPushSubscription,
  removePushSubscription,
  sendCheckIn,
  updateNotificationPreferences,
} from '@dwd/data';
import type { CheckInResult, NotificationPreferences } from '@dwd/core';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const preferencesSchema = z.object({
  groupAttentionEnabled: z.boolean(),
  directCheckinsEnabled: z.boolean(),
  personalPaceEnabled: z.boolean(),
  plannedEndEnabled: z.boolean(),
  periodicWaterEnabled: z.boolean(),
  periodicIntervalMinutes: z.union([z.literal(30), z.literal(60), z.literal(90)]),
});
const checkInSchema = z.object({
  nightId: z.uuid(),
  targetMemberId: z.uuid(),
  requestKey: z.uuid(),
});
const acknowledgeSchema = z.object({ notificationId: z.uuid() });
const acknowledgeCheckInSchema = z.object({ requestId: z.uuid() });
const pushSchema = z.object({
  endpoint: z.url().startsWith('https://').max(2048),
  p256dh: z.string().min(16).max(512),
  auth: z.string().min(8).max(256),
  expirationTime: z.iso.datetime({ offset: true }).nullable().optional(),
});

async function authenticatedClient() {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.auth.getClaims();
  if (error !== null || data?.claims.sub === undefined) throw new Error('Authentication required.');
  return client;
}

export async function updateNotificationPreferencesAction(
  input: unknown,
): Promise<{ ok: true; data: NotificationPreferences } | { ok: false; error: string }> {
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Choose valid notification settings.' };
  try {
    return {
      ok: true,
      data: await updateNotificationPreferences(await authenticatedClient(), parsed.data),
    };
  } catch {
    return { ok: false, error: 'Notification settings could not be saved. Retry.' };
  }
}

export async function acknowledgeNotificationAction(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = acknowledgeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That notification is invalid.' };
  try {
    await acknowledgeNotification(await authenticatedClient(), parsed.data.notificationId);
    return { ok: true };
  } catch {
    return { ok: false, error: 'That notification could not be marked read.' };
  }
}

export async function sendCheckInAction(
  input: unknown,
): Promise<{ ok: true; data: CheckInResult } | { ok: false; error: string }> {
  const parsed = checkInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That check-in is invalid.' };
  try {
    return {
      ok: true,
      data: await sendCheckIn(
        await authenticatedClient(),
        parsed.data.nightId,
        parsed.data.targetMemberId,
        parsed.data.requestKey,
      ),
    };
  } catch {
    return { ok: false, error: 'Check-in could not be sent. Try again while online.' };
  }
}

export async function acknowledgeCheckInAction(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = acknowledgeCheckInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That check-in is invalid.' };
  try {
    await acknowledgeCheckIn(await authenticatedClient(), parsed.data.requestId);
    return { ok: true };
  } catch {
    return { ok: false, error: 'That check-in could not be acknowledged.' };
  }
}

export async function registerPushSubscriptionAction(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = pushSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'This browser subscription is invalid.' };
  try {
    await registerPushSubscription(await authenticatedClient(), {
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.p256dh,
      auth: parsed.data.auth,
      expirationTime: parsed.data.expirationTime ?? null,
    });
    return { ok: true };
  } catch {
    return { ok: false, error: 'Push delivery is not available for this browser yet.' };
  }
}

export async function removePushSubscriptionAction(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = z.url().startsWith('https://').safeParse(input);
  if (!parsed.success) return { ok: false, error: 'This browser subscription is invalid.' };
  try {
    await removePushSubscription(await authenticatedClient(), parsed.data);
    return { ok: true };
  } catch {
    return { ok: false, error: 'The browser subscription could not be removed.' };
  }
}

export async function getPushSubscriptionStatusAction(
  input: unknown,
): Promise<{ ok: true; enabled: boolean } | { ok: false; error: string }> {
  const parsed = z.url().startsWith('https://').max(2048).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'This browser subscription is invalid.' };
  try {
    const client = await authenticatedClient();
    // RLS limits this lookup to the signed-in account. Permission or a device
    // subscription alone does not prove delivery is registered to this user.
    const { data, error } = await client
      .from('push_subscriptions')
      .select('disabled_at, expiration_time')
      .eq('endpoint', parsed.data)
      .maybeSingle();
    if (error) throw error;
    return {
      ok: true,
      enabled:
        data !== null &&
        data.disabled_at === null &&
        (data.expiration_time === null || Date.parse(data.expiration_time) > Date.now()),
    };
  } catch {
    return {
      ok: false,
      error: 'Browser notification status could not load. Retry when connected.',
    };
  }
}
