'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { BrowserNotificationService } from '@/adapters/notifications.browser';
import {
  getPushSubscriptionStatusAction,
  registerPushSubscriptionAction,
  removePushSubscriptionAction,
} from './actions';

type DeviceStatus = 'loading' | 'off' | 'enabled' | 'allowed' | 'blocked' | 'unsupported' | 'error';

export function BrowserNotificationSettings() {
  const [status, setStatus] = useState<DeviceStatus>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const publicKey = process.env['NEXT_PUBLIC_DWD_VAPID_PUBLIC_KEY'];

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const service = new BrowserNotificationService();
      const permission = service.permission();
      let next: DeviceStatus = 'off';
      if (permission === 'unsupported') next = 'unsupported';
      else if (permission === 'denied') next = 'blocked';
      else if (!publicKey) next = permission === 'granted' ? 'allowed' : 'off';
      else if (!service.supportsPush()) next = 'unsupported';
      else if (permission === 'granted') {
        const subscription = await service.currentSubscription();
        if (subscription) {
          const result = await getPushSubscriptionStatusAction(subscription.endpoint);
          if (!result.ok) throw new Error(result.error);
          next = result.enabled ? 'enabled' : 'off';
        }
      }
      if (mounted.current) {
        setStatus(next);
        setError(null);
      }
    } catch {
      if (mounted.current) {
        setStatus('error');
        setError('Browser notification status could not load. Retry when connected.');
      }
    } finally {
      inFlight.current = false;
    }
  }, [publicKey]);

  useEffect(() => {
    mounted.current = true;
    const sync = () => {
      if (document.visibilityState !== 'hidden') void refresh();
    };
    queueMicrotask(sync);
    window.addEventListener('focus', sync);
    window.addEventListener('online', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      mounted.current = false;
      window.removeEventListener('focus', sync);
      window.removeEventListener('online', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [refresh]);

  async function changeDevice(enabled: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const service = new BrowserNotificationService();
      if (!enabled) {
        const subscription = await service.currentSubscription();
        if (subscription) {
          const result = await removePushSubscriptionAction(subscription.endpoint);
          if (!result.ok) throw new Error(result.error);
          // Removing the server registration stops delivery even if the browser
          // cannot revoke its subscription; enabling can safely register again.
          await subscription.unsubscribe().catch(() => false);
        }
        setStatus('off');
        return;
      }
      const permission =
        service.permission() === 'granted' ? 'granted' : await service.requestPermission();
      if (permission !== 'granted') {
        setStatus(
          permission === 'denied'
            ? 'blocked'
            : permission === 'unsupported'
              ? 'unsupported'
              : 'off',
        );
        return;
      }
      if (!publicKey) {
        setStatus('allowed');
        return;
      }
      const subscription = await service.subscribe(publicKey);
      if (!subscription) throw new Error('Browser setup could not finish. Retry when connected.');
      const result = await registerPushSubscriptionAction(subscription);
      if (!result.ok) throw new Error(result.error);
      setStatus('enabled');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Browser setup could not finish. Retry when connected.',
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const descriptions: Record<DeviceStatus, string> = {
    loading: 'Checking this device…',
    off: publicKey
      ? 'Get updates when DWD is closed.'
      : 'Background delivery is unavailable. Updates still appear in DWD.',
    enabled: 'Enabled for your account on this device.',
    allowed: 'Permission allowed. Background delivery is unavailable; check updates in DWD.',
    blocked: 'Blocked by your browser. Allow notifications in this site’s browser settings.',
    unsupported:
      'Unavailable in this browser. On iPhone or iPad, open DWD from your Home Screen to enable notifications.',
    error: 'Device status unavailable.',
  };

  return (
    <section className="notification-device stack" aria-label="Browser notifications">
      <h3>On this device</h3>
      <p className="muted small" role="status">
        {descriptions[status]}
      </p>
      {status === 'enabled' ? (
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => void changeDevice(false)}
        >
          {busy ? 'Turning off…' : 'Turn off on this device'}
        </Button>
      ) : status === 'off' || status === 'error' ? (
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => void changeDevice(true)}
        >
          {busy ? 'Enabling…' : error ? 'Retry browser setup' : 'Enable browser notifications'}
        </Button>
      ) : null}
      {error ? (
        <p className="error-box" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
