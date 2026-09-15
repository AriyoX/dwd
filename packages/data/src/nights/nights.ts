import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ActiveNightSummary,
  Database,
  FinishedNight,
  Json,
  NightSnapshot,
  StartNightInput,
  StartNightResult,
} from '@dwd/core';
import { toJson, unwrapRpc } from '../shared/rpc';

export async function startNightOut(
  client: SupabaseClient<Database>,
  input: StartNightInput,
): Promise<StartNightResult> {
  const { data, error } = await client.rpc('start_night_out', {
    p_creation_key: input.creationKey,
    p_title: input.title,
    p_ends_at: input.endsAt,
    p_timezone: input.timezone,
    p_host_plan: toJson(input.hostPlanItems),
    p_guests: toJson(input.guests),
  });
  return unwrapRpc<StartNightResult>(data, error);
}

export async function getNightSnapshot(
  client: SupabaseClient<Database>,
  nightId: string,
): Promise<NightSnapshot> {
  const { data, error } = await client.rpc('get_night_snapshot', { p_night_id: nightId });
  return unwrapRpc<NightSnapshot>(data, error);
}

export async function getActiveNights(
  client: SupabaseClient<Database>,
): Promise<ActiveNightSummary[]> {
  const { data, error } = await client.rpc('get_active_nights');
  return unwrapRpc<ActiveNightSummary[]>(data, error);
}

export async function getFinishedNights(client: SupabaseClient<Database>, page = 0) {
  const { data, error } = await client.rpc('get_finished_nights', {
    p_page: Math.max(0, Math.floor(page)),
  });
  const nights = unwrapRpc<FinishedNight[]>(data, error);
  return { nights: nights.slice(0, 20), hasMore: nights.length > 20 };
}

export async function getFinishedNightSummary(
  client: SupabaseClient<Database>,
  nightId: string,
): Promise<NightSnapshot> {
  const { data, error } = await client.rpc('get_finished_night_summary', { p_night_id: nightId });
  return unwrapRpc<NightSnapshot>(data, error);
}

export async function extendNight(
  client: SupabaseClient<Database>,
  nightId: string,
  minutes: number,
): Promise<NightSnapshot> {
  const { data, error } = await client.rpc('extend_night', {
    p_night_id: nightId,
    p_minutes: minutes,
  });
  return unwrapRpc<NightSnapshot>(data, error);
}

export async function endNight(
  client: SupabaseClient<Database>,
  nightId: string,
): Promise<NightSnapshot> {
  const { data, error } = await client.rpc('end_night', { p_night_id: nightId });
  return unwrapRpc<NightSnapshot>(data, error);
}

export function asJson(value: unknown): Json {
  return toJson(value);
}
