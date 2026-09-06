import type { DrinkLogRepository } from '@dwd/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CustomDrinkInput,
  Database,
  DrinkLogCommand,
  DrinkLogResult,
  Json,
  WaterLogResult,
} from '@dwd/core';
import { toJson, unwrapRpc } from '../shared/rpc';

export function mapCustomDrinkToRpc(customDrink: CustomDrinkInput): Json {
  return toJson({
    label: customDrink.label,
    category: customDrink.category,
    volume_ml: customDrink.volumeMl,
    abv_percent: customDrink.abvPercent,
  });
}

export async function createDrinkLog(
  client: SupabaseClient<Database>,
  input: DrinkLogCommand,
): Promise<DrinkLogResult> {
  const { data, error } = await client.rpc('log_drink', {
    p_target_member_id: input.targetMemberId,
    ...(input.planItemId === undefined ? {} : { p_plan_item_id: input.planItemId }),
    ...(input.customDrink === undefined
      ? {}
      : { p_custom_drink: mapCustomDrinkToRpc(input.customDrink) }),
    p_consumed_at: input.consumedAt,
    p_idempotency_key: input.idempotencyKey,
    p_ack_plan_exceeded: input.acknowledgePlanExceeded,
    p_ack_after_end: input.acknowledgeAfterEnd,
  });
  return unwrapRpc<DrinkLogResult>(data, error);
}

export async function createWaterLog(
  client: SupabaseClient<Database>,
  input: { targetMemberId: string; consumedAt: string; idempotencyKey: string },
): Promise<WaterLogResult> {
  const { data, error } = await client.rpc('log_water', {
    p_target_member_id: input.targetMemberId,
    p_consumed_at: input.consumedAt,
    p_idempotency_key: input.idempotencyKey,
  });
  return unwrapRpc<WaterLogResult>(data, error);
}

export async function softDeleteActivity(
  client: SupabaseClient<Database>,
  logId: string,
  kind: 'alcohol' | 'water',
): Promise<void> {
  const { data, error } = await client.rpc('soft_delete_activity', {
    p_log_id: logId,
    p_kind: kind,
  });
  unwrapRpc<{ deleted: boolean }>(data, error);
}

export async function findDrinkByIdempotencyKey(
  client: SupabaseClient<Database>,
  idempotencyKey: string,
): Promise<DrinkLogResult | null> {
  const { data, error } = await client.rpc('find_drink_by_idempotency_key', {
    p_idempotency_key: idempotencyKey,
  });
  if (error !== null) throw error;
  return data === null ? null : (data as DrinkLogResult);
}

export function createSupabaseDrinkLogRepository(
  client: SupabaseClient<Database>,
): DrinkLogRepository {
  return {
    create: (input) => createDrinkLog(client, input),
    createWater: (input) => createWaterLog(client, input),
    softDelete: (logId, kind) => softDeleteActivity(client, logId, kind),
    findByIdempotencyKey: (key) => findDrinkByIdempotencyKey(client, key),
  };
}
