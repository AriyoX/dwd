import type { SupabaseClient } from '@supabase/supabase-js';
import { displayNameSchema, type Database } from '@dwd/core';
import { z } from 'zod';
import { unwrapRpc } from '../shared/rpc';

export async function getAccountDetails(client: SupabaseClient<Database>, owner: string) {
  const { data, error } = await client
    .from('profiles')
    .select('display_name')
    .eq('id', owner)
    .single();
  if (error) throw error;
  return data;
}
export async function updateDisplayName(client: SupabaseClient<Database>, displayName: string) {
  const { data, error } = await client.rpc('update_own_display_name', {
    p_display_name: displayNameSchema.parse(displayName),
  });
  return z.object({ displayName: z.string() }).parse(unwrapRpc(data, error));
}
export async function getAccountDeletion(client: SupabaseClient<Database>) {
  const { data, error } = await client
    .from('account_deletions')
    .select('delete_after, status')
    .maybeSingle();
  if (error) throw error;
  return data;
}
export async function scheduleAccountDeletion(client: SupabaseClient<Database>) {
  const { data, error } = await client.rpc('schedule_account_deletion');
  return z
    .object({ deleteAfter: z.iso.datetime({ offset: true }), status: z.string() })
    .parse(unwrapRpc(data, error));
}
export async function cancelAccountDeletion(client: SupabaseClient<Database>) {
  const { error } = await client.rpc('cancel_account_deletion');
  if (error) throw error;
}
export async function getAppleDeletionReady(client: SupabaseClient<Database>) {
  const { data, error } = await client.rpc('get_apple_deletion_ready');
  return z.boolean().parse(unwrapRpc(data, error));
}
export const supportRequestSchema = z.object({
  requestKey: z.uuid(),
  kind: z.enum(['feedback', 'problem']),
  message: z
    .string()
    .trim()
    .min(10, 'Write at least 10 characters.')
    .max(4000, 'Use up to 4,000 characters.'),
});
export type SupportRequestInput = z.infer<typeof supportRequestSchema>;
export async function submitSupportRequest(
  client: SupabaseClient<Database>,
  input: SupportRequestInput,
) {
  const parsed = supportRequestSchema.parse(input);
  const { data, error } = await client.rpc('submit_support_request', {
    p_request_key: parsed.requestKey,
    p_kind: parsed.kind,
    p_message: parsed.message,
  });
  return unwrapRpc<string>(data, error);
}
export async function getSupportRequests(client: SupabaseClient<Database>) {
  const { data, error } = await client
    .from('support_requests')
    .select('id, kind, message, status, response, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}
