'use server';

import {
  drinkLogCommandSchema,
  softDeleteLogSchema,
  waterLogCommandSchema,
  type DrinkLogResult,
  type WaterLogResult,
} from '@dwd/core';
import {
  createDrinkLog,
  createWaterLog,
  findDrinkByIdempotencyKey,
  softDeleteActivity,
} from '@dwd/data';
import { createServerSupabaseClient } from '@/lib/supabase/server';

async function authenticatedClient() {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.auth.getClaims();
  if (error !== null || data?.claims.sub === undefined) throw new Error('Authentication required.');
  return client;
}

export async function logDrinkAction(input: unknown): Promise<DrinkLogResult> {
  const parsed = drinkLogCommandSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 'permanently_rejected',
      code: 'invalid_input',
      message: 'This drink entry is invalid.',
    };
  }
  try {
    const client = await authenticatedClient();
    return await createDrinkLog(client, parsed.data);
  } catch {
    return {
      status: 'temporarily_failed',
      message: 'The drink is queued and will retry when the connection returns.',
    };
  }
}

export async function logWaterAction(input: unknown): Promise<WaterLogResult> {
  const parsed = waterLogCommandSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 'permanently_rejected',
      code: 'invalid_input',
      message: 'This water entry is invalid.',
    };
  }
  try {
    const client = await authenticatedClient();
    return await createWaterLog(client, parsed.data);
  } catch {
    return {
      status: 'temporarily_failed',
      message: 'The water entry is queued and will retry when the connection returns.',
    };
  }
}

export async function deleteActivityAction(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = softDeleteLogSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That activity is invalid.' };
  try {
    const client = await authenticatedClient();
    await softDeleteActivity(client, parsed.data.logId, parsed.data.kind);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Undo is unavailable or its 15-minute window has closed.' };
  }
}

export async function resolveDrinkAction(idempotencyKey: string): Promise<DrinkLogResult | null> {
  try {
    const client = await authenticatedClient();
    return await findDrinkByIdempotencyKey(client, idempotencyKey);
  } catch {
    return null;
  }
}
