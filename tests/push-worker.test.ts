import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function worker(status = 204) {
  const listeners = new Map<string, (event: unknown) => void>();
  const show = vi.fn(() => Promise.resolve());
  const openWindow = vi.fn(() => Promise.resolve());
  const fetch = vi.fn(() => Promise.resolve({ status }));
  runInNewContext(readFileSync('apps/web/public/sw.js', 'utf8'), {
    URL,
    fetch,
    encodeURIComponent,
    AbortController,
    setTimeout,
    clearTimeout,
    self: {
      location: { origin: 'https://dwd.example.test' },
      addEventListener: (type: string, listener: (event: unknown) => void) =>
        listeners.set(type, listener),
      registration: { showNotification: show },
      clients: { matchAll: () => Promise.resolve([]), openWindow },
    },
  });
  async function push(
    url: string,
    malformed = false,
    message = { title: 'DWD notification', body: 'You have a DWD check-in.' },
  ) {
    let done: Promise<unknown> = Promise.resolve();
    listeners.get('push')?.({
      data: {
        json: () =>
          malformed
            ? null
            : {
                eventId: 'test-event',
                url,
                ...message,
              },
      },
      waitUntil: (work: Promise<unknown>) => {
        done = work;
      },
    });
    await done;
  }
  async function click(url: string, action = '') {
    let done: Promise<unknown> = Promise.resolve();
    listeners.get('notificationclick')?.({
      action,
      notification: { data: { url }, close: vi.fn() },
      waitUntil: (work: Promise<unknown>) => {
        done = work;
      },
    });
    await done;
  }
  return { push, click, show, fetch, openWindow };
}

describe('service worker notification privacy', () => {
  it.each([
    { title: 'Quick check-in — anything to log?', body: 'Keep your night record up to date.' },
    { title: 'Night check-in', body: 'Your planned night has ended.' },
    { title: 'Personal pace reminder', body: 'Your recent pace is faster than planned.' },
    { title: 'Alex checked in on you', body: 'Alex checked in on you.' },
    { title: 'Check in with Sam', body: 'Sam may need a check-in.' },
  ])('shows the actual title and message: $title', async (message) => {
    const app = worker();
    await app.push('/night/test', false, message);
    expect(app.show).toHaveBeenCalledWith(
      message.title,
      expect.objectContaining({ body: message.body, data: { url: '/night/test' } }),
    );
  });
  it('includes the night link only after the current account authorizes the event', async () => {
    const app = worker();
    await app.push('/night/test');
    expect(app.fetch).toHaveBeenCalledWith(
      '/api/notifications/push?id=test-event',
      expect.objectContaining({ credentials: 'include', cache: 'no-store' }),
    );
    expect(app.show).toHaveBeenCalledWith(
      'DWD notification',
      expect.objectContaining({ data: { url: '/night/test' } }),
    );
  });
  it('offers safe fast-log actions only on authorized night links', async () => {
    const app = worker();
    await app.push('/night/test?fast=1');
    expect(app.show).toHaveBeenCalledWith(
      'DWD notification',
      expect.objectContaining({
        actions: [
          { action: 'log-drink', title: 'Log drink' },
          { action: 'log-chaser', title: 'Log chaser' },
          { action: 'open-dwd', title: 'Open dwd' },
        ],
      }),
    );
    await app.click('/night/test?fast=1', 'log-chaser');
    expect(app.openWindow).toHaveBeenCalledWith('/night/test?fast=chaser');
  });
  it.each([401, 404, 500])(
    'uses a generic visible fallback for an unauthorized or unverifiable payload (%i)',
    async (status) => {
      const app = worker(status);
      await app.push('/night/test', false, {
        title: 'Alex checked in on you',
        body: 'Alex checked in on you.',
      });
      expect(app.show).toHaveBeenCalledWith('DWD update', {
        body: 'Open DWD to check your notifications.',
        tag: 'dwd-update',
        data: { url: '/account#notifications' },
      });
    },
  );
  it('still shows a generic update on a transport failure', async () => {
    const app = worker();
    app.fetch.mockRejectedValueOnce(new Error('offline'));
    await app.push('/night/private');
    expect(app.show).toHaveBeenCalledWith(
      'DWD update',
      expect.objectContaining({ data: { url: '/account#notifications' } }),
    );
  });
  it('tolerates an empty payload without using silent push', async () => {
    const app = worker();
    await app.push('/night/private', true);
    expect(app.fetch).not.toHaveBeenCalled();
    expect(app.show).toHaveBeenCalledWith(
      'DWD update',
      expect.objectContaining({ data: { url: '/account#notifications' } }),
    );
  });
  it.each([
    '//evil.example.test/path',
    '/\\evil.example.test/path',
    'https://evil.example.test',
    'javascript:alert(1)',
  ])('keeps notification links on the app origin: %s', async (url) => {
    const app = worker();
    await app.push(url);
    expect(app.show).toHaveBeenCalledWith(
      'DWD notification',
      expect.objectContaining({ data: { url: '/account' } }),
    );
  });
});
