'use client';

import type { BrowserNotificationRequest, NotificationService } from '@dwd/contracts';

export class BrowserNotificationService implements NotificationService {
  public permission(): 'default' | 'denied' | 'granted' | 'unsupported' {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
  }

  public async requestPermission(): Promise<'default' | 'denied' | 'granted' | 'unsupported'> {
    if (this.permission() === 'unsupported') return 'unsupported';
    return Notification.requestPermission();
  }

  public show(input: BrowserNotificationRequest): Promise<boolean> {
    if (this.permission() !== 'granted') return Promise.resolve(false);
    new Notification(input.title, { body: input.body, tag: input.tag });
    return Promise.resolve(true);
  }

  public vibrate(pattern: readonly number[] = [120, 80, 120]): boolean {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
    return navigator.vibrate([...pattern]);
  }
}
