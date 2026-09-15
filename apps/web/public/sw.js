/* DWD push worker. It intentionally caches no authenticated responses. */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    const parsed = event.data ? event.data.json() : {};
    payload = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    payload = {};
  }
  const title = typeof payload.title === 'string' ? payload.title : 'DWD notification';
  const body = typeof payload.body === 'string' ? payload.body : 'You have a DWD notification.';
  const url = safePath(payload.url);
  event.waitUntil(
    (async () => {
      let authorized = false;
      if (typeof payload.eventId === 'string') {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          const response = await fetch(
            `/api/notifications/push?id=${encodeURIComponent(payload.eventId)}`,
            {
              credentials: 'include',
              cache: 'no-store',
              redirect: 'error',
              signal: controller.signal,
            },
          );
          authorized = response.status === 204;
        } catch {
          // A received push must still be visible (Safari revokes silent-push
          // subscriptions). Never expose an unverified event's text or link.
        } finally {
          clearTimeout(timeout);
        }
      }
      if (!authorized) {
        return self.registration.showNotification('DWD update', {
          body: 'Open DWD to check your notifications.',
          tag: 'dwd-update',
          data: { url: '/account#notifications' },
        });
      }
      return self.registration.showNotification(title, {
        body,
        tag: typeof payload.tag === 'string' ? payload.tag : undefined,
        data: { url },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = safePath(event.notification.data?.url);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const existing = clients.find((client) => 'focus' in client);
      if (existing) {
        await existing.navigate(url);
        return existing.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});

function safePath(value) {
  if (typeof value !== 'string') return '/account';
  try {
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin
      ? `${url.pathname}${url.search}${url.hash}`
      : '/account';
  } catch {
    return '/account';
  }
}
