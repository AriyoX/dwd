import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CheckInResult,
  Database,
  NotificationEvent,
  NotificationPreferences,
} from '@dwd/core';
import { unwrapRpc } from '../shared/rpc';

export async function getNotificationPreferences(
  client: SupabaseClient<Database>,
): Promise<NotificationPreferences> {
  const { data, error } = await client.rpc('get_notification_preferences');
  return unwrapRpc<NotificationPreferences>(data, error);
}

export async function updateNotificationPreferences(
  client: SupabaseClient<Database>,
  preferences: NotificationPreferences,
): Promise<NotificationPreferences> {
  const { data, error } = await client.rpc('update_notification_preferences', {
    p_group_attention_enabled: preferences.groupAttentionEnabled,
    p_direct_checkins_enabled: preferences.directCheckinsEnabled,
    p_personal_pace_enabled: preferences.personalPaceEnabled,
    p_planned_end_enabled: preferences.plannedEndEnabled,
    p_periodic_water_enabled: preferences.periodicWaterEnabled,
    p_periodic_interval_minutes: preferences.periodicIntervalMinutes,
  });
  return unwrapRpc<NotificationPreferences>(data, error);
}

export async function getMyNotificationEvents(
  client: SupabaseClient<Database>,
  limit = 50,
): Promise<NotificationEvent[]> {
  const { data, error } = await client.rpc('get_my_notification_events', { p_limit: limit });
  return unwrapRpc<NotificationEvent[]>(data, error);
}

export async function acknowledgeNotification(
  client: SupabaseClient<Database>,
  notificationId: string,
): Promise<void> {
  const { data, error } = await client.rpc('acknowledge_notification', {
    p_notification_id: notificationId,
  });
  unwrapRpc<{ acknowledged: boolean }>(data, error);
}

export async function registerPushSubscription(
  client: SupabaseClient<Database>,
  input: { endpoint: string; p256dh: string; auth: string; expirationTime?: string | null },
): Promise<void> {
  const { data, error } = await client.rpc('register_push_subscription', {
    p_endpoint: input.endpoint,
    p_p256dh: input.p256dh,
    p_auth: input.auth,
    ...(input.expirationTime == null ? {} : { p_expiration_time: input.expirationTime }),
  });
  unwrapRpc<{ id: string }>(data, error);
}

export async function removePushSubscription(
  client: SupabaseClient<Database>,
  endpoint: string,
): Promise<void> {
  const { data, error } = await client.rpc('remove_push_subscription', { p_endpoint: endpoint });
  unwrapRpc<{ removed: boolean }>(data, error);
}

export async function sendCheckIn(
  client: SupabaseClient<Database>,
  nightId: string,
  targetMemberId: string,
  requestKey: string,
): Promise<CheckInResult> {
  const { data, error } = await client.rpc('send_check_in', {
    p_night_id: nightId,
    p_target_member_id: targetMemberId,
    p_request_key: requestKey,
  });
  return unwrapRpc<CheckInResult>(data, error);
}

export async function acknowledgeCheckIn(
  client: SupabaseClient<Database>,
  requestId: string,
): Promise<void> {
  const { data, error } = await client.rpc('acknowledge_check_in', { p_request_id: requestId });
  unwrapRpc<{ acknowledged: boolean }>(data, error);
}
