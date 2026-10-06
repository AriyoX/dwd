import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, NightSnapshot, SharedBottleInput } from '@dwd/core';
import { toJson, unwrapRpc } from '../shared/rpc';

export async function createSharedBottle(
  client: SupabaseClient<Database>,
  nightId: string,
  bottle: SharedBottleInput,
): Promise<NightSnapshot> {
  const { data, error } = await client.rpc('create_shared_bottle', {
    p_night_id: nightId,
    p_bottle: toJson(bottle),
  });
  return unwrapRpc<NightSnapshot>(data, error);
}

export async function shareBottleAndPlan(
  client: SupabaseClient<Database>,
  nightId: string,
  bottle: SharedBottleInput,
  memberId: string,
  expectedRevision: number,
  requestKey: string,
  choices?: { makeMain: boolean; creatorExpectedRevision: number; creatorMakeMain: boolean },
): Promise<NightSnapshot> {
  const { data, error } = await client.rpc('share_bottle_and_plan', {
    p_night_id: nightId,
    p_bottle: toJson(bottle),
    p_member_id: memberId,
    p_expected_revision: expectedRevision,
    p_request_key: requestKey,
    ...(choices && {
      p_make_main: choices.makeMain,
      p_creator_expected_revision: choices.creatorExpectedRevision,
      p_creator_make_main: choices.creatorMakeMain,
    }),
  });
  return unwrapRpc<NightSnapshot>(data, error);
}

export async function planSharedBottle(
  client: SupabaseClient<Database>,
  bottleId: string,
  memberId: string,
  quantity: number,
  servingMl: number,
  expectedRevision: number,
  requestKey: string,
  makeMain: boolean,
): Promise<NightSnapshot> {
  const { data, error } = await client.rpc('plan_shared_bottle', {
    p_bottle_id: bottleId,
    p_member_id: memberId,
    p_quantity: quantity,
    p_serving_ml: servingMl,
    p_expected_revision: expectedRevision,
    p_request_key: requestKey,
    p_make_main: makeMain,
  });
  return unwrapRpc<NightSnapshot>(data, error);
}

export async function setBottleMembership(
  client: SupabaseClient<Database>,
  bottleId: string,
  memberId: string,
  join: boolean,
): Promise<NightSnapshot> {
  const { data, error } = await client.rpc('set_shared_bottle_membership', {
    p_bottle_id: bottleId,
    p_member_id: memberId,
    p_join: join,
  });
  return unwrapRpc<NightSnapshot>(data, error);
}

export async function closeSharedBottle(
  client: SupabaseClient<Database>,
  bottleId: string,
): Promise<NightSnapshot> {
  const { data, error } = await client.rpc('close_shared_bottle', { p_bottle_id: bottleId });
  return unwrapRpc<NightSnapshot>(data, error);
}
