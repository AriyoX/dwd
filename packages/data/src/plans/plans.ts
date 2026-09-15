import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, NightSnapshot, PlanItemInput } from '@dwd/core';
import { toJson, unwrapRpc } from '../shared/rpc';

export async function replaceMemberPlan(
  client: SupabaseClient<Database>,
  memberId: string,
  items: readonly PlanItemInput[],
  expectedRevision?: number,
): Promise<NightSnapshot> {
  const { data, error } = await client.rpc('replace_member_plan_v2', {
    p_member_id: memberId,
    p_items: toJson(items),
    ...(expectedRevision === undefined ? {} : { p_expected_revision: expectedRevision }),
  });
  return unwrapRpc<NightSnapshot>(data, error);
}
