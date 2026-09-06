import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, NightSnapshot, PlanItemInput } from '@dwd/core';
import { toJson, unwrapRpc } from '../shared/rpc';

export async function replaceMemberPlan(
  client: SupabaseClient<Database>,
  memberId: string,
  items: readonly PlanItemInput[],
): Promise<NightSnapshot> {
  const { data, error } = await client.rpc('replace_member_plan', {
    p_member_id: memberId,
    p_items: toJson(items),
  });
  return unwrapRpc<NightSnapshot>(data, error);
}
