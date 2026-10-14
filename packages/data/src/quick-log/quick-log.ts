import type { SupabaseClient } from '@supabase/supabase-js';
import {
  quickReceiptSchema,
  quickSessionSchema,
  type QuickSession,
  type Database,
  type QuickTransfer,
} from '@dwd/core';
import { toJson, unwrapRpc } from '../shared/rpc';

export async function importQuickLogs(client: SupabaseClient<Database>, operation: QuickTransfer) {
  const { data, error } = await client.rpc('import_quick_log', {
    p_operation_id: operation.id,
    p_session_id: operation.sessionId,
    p_night_id: operation.nightId,
    p_member_id: operation.memberId,
    p_entries: toJson(operation.entries),
  });
  return quickReceiptSchema.parse(unwrapRpc(data, error));
}
export async function correctNightQuickLog(
  client: SupabaseClient<Database>,
  id: string,
  kind: 'drink' | 'shot' | 'chaser' | 'remove',
) {
  const { data, error } = await client.rpc('correct_quick_log', { p_entry_id: id, p_kind: kind });
  return unwrapRpc(data, error);
}
export async function saveQuickSession(
  client: SupabaseClient<Database>,
  session: QuickSession,
  entries: QuickSession['entries'],
) {
  const { data, error } = await client.rpc('sync_quick_log', {
    p_session: toJson({
      id: session.id,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      finishedAt: session.finishedAt,
    }),
    p_entries: toJson(entries),
  });
  return quickSessionSchema.parse(unwrapRpc(data, error));
}
export async function getQuickSessions(client: SupabaseClient<Database>) {
  const sessions: QuickSession[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await client.rpc(
      'get_quick_log_sessions',
      { p_page: page },
      { get: true },
    );
    const batch = quickSessionSchema.array().parse(unwrapRpc(data, error));
    sessions.push(...batch);
    if (batch.length < 50) return sessions;
  }
}
