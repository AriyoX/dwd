import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, NightSnapshot, PlanItemInput } from '@dwd/core';
import { toJson, unwrapRpc } from '../shared/rpc';

export async function addManagedGuest(
  client: SupabaseClient<Database>,
  nightId: string,
  displayName: string,
  plan: readonly PlanItemInput[],
): Promise<NightSnapshot> {
  const { data, error } = await client.rpc('add_managed_guest', {
    p_night_id: nightId,
    p_display_name: displayName,
    p_plan: toJson(plan),
  });
  return unwrapRpc<NightSnapshot>(data, error);
}

export async function removeManagedGuest(
  client: SupabaseClient<Database>,
  memberId: string,
): Promise<NightSnapshot> {
  const { data, error } = await client.rpc('remove_managed_guest', { p_member_id: memberId });
  return unwrapRpc<NightSnapshot>(data, error);
}

export async function leaveNight(client: SupabaseClient<Database>, nightId: string): Promise<void> {
  const { data, error } = await client.rpc('leave_night', { p_night_id: nightId });
  unwrapRpc<{ left: boolean }>(data, error);
}
