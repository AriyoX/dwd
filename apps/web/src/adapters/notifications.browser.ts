'use client';

import type {
  BrowserNotificationRequest,
  BrowserPushSubscription,
  NotificationService,
} from '@dwd/contracts';

export class BrowserNotificationService implements NotificationService {
  public supportsPush(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      typeof window !== 'undefined' &&
      'PushManager' in window
    );
  }

  public async currentSubscription(): Promise<PushSubscription | null> {
    if (!this.supportsPush()) return null;
    const registration = await navigator.serviceWorker.getRegistration('/');
    return registration ? registration.pushManager.getSubscription() : null;
  }

  public permission(): 'default' | 'denied' | 'granted' | 'unsupported' {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
  }

  public async requestPermission(): Promise<'default' | 'denied' | 'granted' | 'unsupported'> {
    if (this.permission() === 'unsupported') return 'unsupported';
    try {
      return await Notification.requestPermission();
    } catch {
      return this.permission();
    }
  }

  public async show(input: BrowserNotificationRequest): Promise<boolean> {
    if (this.permission() !== 'granted') return Promise.resolve(false);
    try {
      new Notification(input.title, { body: input.body, tag: input.tag });
      return true;
    } catch {
      return false;
    }
  }

  public vibrate(pattern: readonly number[] = [120, 80, 120]): boolean {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
    return navigator.vibrate([...pattern]);
  }

  public async subscribe(publicKey: string): Promise<BrowserPushSubscription | null> {
    if (typeof navigator === 'undefined' || !this.supportsPush() || this.permission() !== 'granted')
      return null;
    try {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const ready = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Service worker did not activate.')), 10_000);
        }),
      ]).finally(() => clearTimeout(timeout));
      const key = decodeVapidKey(publicKey);
      let existing = await ready.pushManager.getSubscription();
      const existingKey = existing?.options.applicationServerKey;
      if (
        existing &&
        existingKey &&
        (existingKey.byteLength !== key.length ||
          new Uint8Array(existingKey).some((byte, index) => byte !== key[index]))
      ) {
        if (!(await existing.unsubscribe())) return null;
        existing = null;
      }
      const subscription =
        existing ??
        (await ready.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key as unknown as BufferSource,
        }));
      const json = subscription.toJSON();
      if (
        json.endpoint === undefined ||
        json.keys?.['p256dh'] === undefined ||
        json.keys['auth'] === undefined
      )
        return null;
      return {
        endpoint: json.endpoint,
        p256dh: json.keys['p256dh'],
        auth: json.keys['auth'],
        expirationTime:
          subscription.expirationTime === null
            ? null
            : new Date(subscription.expirationTime).toISOString(),
      };
    } catch {
      return null;
    }
  }
}

function decodeVapidKey(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
