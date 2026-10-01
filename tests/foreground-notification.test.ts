import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationEvent } from '@dwd/core';
import { showForegroundNotification } from '@/features/notifications/foreground-notification';

const event: NotificationEvent = {
  id: '71000000-0000-4000-8000-000000000001',
  eventKey: 'test-checkin',
  recipientUserId: 'recipient',
  senderUserId: 'sender',
  nightId: 'night',
  targetMemberId: null,
  category: 'direct_checkin',
  eventType: 'direct_checkin',
  title: 'Alex checked in on you',
  body: 'Alex checked in on you.',
  deepLink: '/night/night',
  createdAt: new Date().toISOString(),
  expiresAt: null,
  acknowledgedAt: null,
};
const message = { title: event.title, body: event.body, tag: event.id };
const service = {
  permission: vi.fn(() => 'granted' as const),
  requestPermission: vi.fn(() => Promise.resolve('granted' as const)),
  show: vi.fn(() => Promise.resolve(true)),
  vibrate: vi.fn(() => false),
};
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue({ status: 204 });
});
afterEach(() => vi.unstubAllGlobals());

function show(item = event, isCurrent = () => true, signal = new AbortController().signal) {
  return showForegroundNotification(item, message, service, signal, isCurrent);
}

describe('foreground notification eligibility', () => {
  it('displays the event message only after verifying the current account', async () => {
    expect(await show()).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/notifications/push?id=${event.id}`,
      expect.objectContaining({ credentials: 'same-origin', cache: 'no-store', redirect: 'error' }),
    );
    expect(service.show).toHaveBeenCalledWith(message);
  });

  it.each([401, 404, 500])(
    'does not expose a message when verification returns %i',
    async (status) => {
      fetchMock.mockResolvedValueOnce({ status });
      expect(await show()).toBe(false);
      expect(service.show).not.toHaveBeenCalled();
    },
  );

  it('keeps the message private when offline', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await show()).toBe(false);
    expect(service.show).not.toHaveBeenCalled();
  });

  it.each([
    { acknowledgedAt: new Date().toISOString() },
    { expiresAt: new Date(Date.now() - 1).toISOString() },
    { createdAt: new Date(Date.now() - 120_001).toISOString() },
  ])('skips an event that became stale while waiting for the lock: %j', async (change) => {
    expect(await show({ ...event, ...change })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(service.show).not.toHaveBeenCalled();
  });

  it('skips delivery when the inbox unmounts or marks the event read before the lock opens', async () => {
    expect(await show(event, () => false)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(service.show).not.toHaveBeenCalled();
  });

  it('rechecks local state after authorization completes', async () => {
    let current = true;
    fetchMock.mockImplementationOnce(() => {
      current = false;
      return Promise.resolve({ status: 204 });
    });
    expect(await show(event, () => current)).toBe(false);
    expect(service.show).not.toHaveBeenCalled();
  });

  it('cancels delivery when the refresh is aborted during authorization', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementationOnce(() => {
      controller.abort();
      return Promise.resolve({ status: 204 });
    });
    expect(await show(event, () => true, controller.signal)).toBe(false);
    expect(service.show).not.toHaveBeenCalled();
  });
});
