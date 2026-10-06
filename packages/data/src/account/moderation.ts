import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dwd/core';
import { unwrapRpc } from '../shared/rpc';

export const reportContentSchema = z.object({
  nightId: z.uuid(),
  memberId: z.uuid().nullable().default(null),
  photoId: z.uuid().nullable().default(null),
  reason: z.string().trim().min(10).max(2000),
  requestKey: z.uuid(),
});
export async function reportContent(
  client: SupabaseClient<Database>,
  input: z.input<typeof reportContentSchema>,
) {
  const parsed = reportContentSchema.parse(input);
  const { data, error } = await client.rpc('report_content', {
    p_night_id: parsed.nightId,
    p_member_id: parsed.memberId,
    p_photo_id: parsed.photoId,
    p_reason: parsed.reason,
    p_request_key: parsed.requestKey,
  });
  return unwrapRpc<string>(data, error);
}
export async function blockUser(client: SupabaseClient<Database>, userId: string) {
  const { error } = await client.rpc('block_user', { p_user_id: z.uuid().parse(userId) });
  if (error) throw error;
}
export async function unblockUser(client: SupabaseClient<Database>, userId: string) {
  const { error } = await client.rpc('unblock_user', { p_user_id: z.uuid().parse(userId) });
  if (error) throw error;
}
export async function getBlockedUsers(client: SupabaseClient<Database>) {
  const { data, error } = await client.rpc('get_blocked_users');
  return z
    .array(z.object({ userId: z.uuid(), displayName: z.string() }))
    .parse(unwrapRpc(data, error));
}
