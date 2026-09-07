import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ActiveNightSummary,
  Database,
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
  const offset = Math.max(0, Math.floor(page)) * 20;
  // The nights SELECT policy requires current membership, including for ended nights.
  const { data, error } = await client
    .from('nights')
    .select('id, title, starts_at, ended_at')
    .eq('status', 'ended')
    .order('ended_at', { ascending: false })
    .order('id')
    .range(offset, offset + 20);
  if (error) throw error;
  return { nights: data.slice(0, 20), hasMore: data.length > 20 };
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
