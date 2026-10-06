import { describe, expect, it } from 'vitest';
import type { NotificationEvent } from '@dwd/core';
import { notificationRoute } from '../apps/mobile/src/lib/native-notifications';
import {
  AuthHandoff,
  captureNativeDestination,
  safeDestination,
} from '../apps/mobile/src/lib/auth-state';

const id = '91000000-0000-4000-8000-000000000001';
const route = `/night/new?source=push&campaign=friday_preplot&notificationId=${id}`;
describe('pre-plot routing', () => {
  it('keeps campaign attribution through a signed-out cold start', () => {
    const store = new Map<string, string>();
    const handoff = new AuthHandoff({
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => {
        store.set(key, value);
      },
      removeItem: (key) => {
        store.delete(key);
      },
    });
    expect(captureNativeDestination(`dwd://${route.slice(1)}`, handoff)).toBe(route);
    expect(handoff.consume()).toBe(route);
  });
  it('uses the verified database event and rejects injected destinations', () => {
    expect(
      notificationRoute({ id, eventType: 'preplot', deepLink: route } as NotificationEvent),
    ).toBe(route);
    expect(
      notificationRoute({
        id,
        eventType: 'preplot',
        deepLink: 'https://evil.test',
      } as NotificationEvent),
    ).toBe('/night/new');
    expect(safeDestination(`${route}&next=https://evil.test`)).toBe('/');
    expect(
      notificationRoute({
        id,
        eventType: 'preplot',
        deepLink: route.replace(id, 'other'),
      } as NotificationEvent),
    ).toBe('/night/new');
  });
});
