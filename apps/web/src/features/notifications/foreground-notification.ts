import type { NotificationEvent } from '@dwd/core';
import type { BrowserNotificationRequest, NotificationService } from '@dwd/contracts';

// Call inside the delivery lock: the account or event may have changed while
// another tab held the lock. Recheck local state again after the network request.
export async function showForegroundNotification(
  event: NotificationEvent,
  message: BrowserNotificationRequest,
  service: NotificationService,
  signal: AbortSignal,
  isCurrent: () => boolean,
): Promise<boolean> {
  const eligible = () =>
    !signal.aborted &&
    isCurrent() &&
    event.acknowledgedAt === null &&
    Date.now() - Date.parse(event.createdAt) <= 120_000 &&
    (event.expiresAt === null || Date.parse(event.expiresAt) > Date.now());

  if (!eligible() || service.permission() !== 'granted') return false;
  try {
    const response = await fetch(`/api/notifications/push?id=${encodeURIComponent(event.id)}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
    });
    if (response.status !== 204 || !eligible()) return false;
    return await service.show(message);
  } catch {
    // The inbox remains available if the current event cannot be verified.
    return false;
  }
}
