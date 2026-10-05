import { z } from 'zod';
import type { NotificationEvent } from '@dwd/core';

const payload = z.object({
  eventId: z.uuid(),
  recipientUserId: z.uuid(),
  nightId: z.uuid().nullable(),
});
export function notificationTarget(data: unknown, owner: string) {
  const parsed = payload.safeParse(data);
  return parsed.success && parsed.data.recipientUserId === owner ? parsed.data : null;
}
export function notificationRoute(event: NotificationEvent) {
  // Never navigate to arbitrary URLs supplied by a push message.
  return event.nightId ? `/night/${event.nightId}` : '/notifications';
}
export const pushPreferenceKey = (owner: string) => `dwd.mobile.push.v1:${owner}`;
export const pushRegistrationKey = (owner: string) => `dwd.mobile.push-registration.v1:${owner}`;
export const INSTALLATION_KEY = 'dwd.mobile.installation.v1';
export function pushPermissionAllowed(permission: { granted: boolean; ios?: { status: number } }) {
  return permission.granted || permission.ios?.status === 3; // iOS provisional authorization
}
export function pushProjectId(
  extra: unknown,
  easId: string | undefined,
  configured: unknown,
): string | null {
  const parsed = z.object({ eas: z.object({ projectId: z.string() }) }).safeParse(extra);
  const value =
    typeof configured === 'string' && configured
      ? configured
      : (easId ?? (parsed.success ? parsed.data.eas.projectId : null));
  return typeof value === 'string' && z.uuid().safeParse(value).success ? value : null;
}
