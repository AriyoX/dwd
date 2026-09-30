'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { BrowserNotificationService } from '@/adapters/notifications.browser';
import { usePwaRuntime } from '@/features/install/pwa-runtime';
import {
  getPushSubscriptionStatusAction,
  registerPushSubscriptionAction,
  removePushSubscriptionAction,
} from './actions';

type DeliveryState = 'loading' | 'off' | 'enabled' | 'allowed' | 'error';

export function BrowserNotificationSettings() {
  const runtime = usePwaRuntime();
  const [delivery, setDelivery] = useState<DeliveryState>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instructions, setInstructions] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const publicKey = process.env['NEXT_PUBLIC_DWD_VAPID_PUBLIC_KEY'];
  const requiresInstall = runtime.platform === 'ios' && !runtime.installed;

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const service = new BrowserNotificationService();
      let next: DeliveryState = 'off';
      if (runtime.permission === 'granted' && !publicKey) next = 'allowed';
      else if (runtime.permission === 'granted' && service.supportsPush()) {
        const subscription = await service.currentSubscription();
        if (subscription) {
          const result = await getPushSubscriptionStatusAction(subscription.endpoint);
          if (!result.ok) throw new Error(result.error);
          next = result.enabled ? 'enabled' : 'off';
        }
      }
      if (mounted.current) {
        setDelivery(next);
        setError(null);
      }
    } catch {
      if (mounted.current) {
        setDelivery('error');
        setError('Notification status could not load. Retry when connected.');
      }
    } finally {
      inFlight.current = false;
    }
  }, [publicKey, runtime.permission]);

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

  async function install() {
    setBusy(true);
    const result = await runtime.install();
    if (result === 'manual' || result === 'unavailable') setInstructions(true);
    if (result === 'dismissed') runtime.dismissInstall();
    setBusy(false);
  }

  async function changeDevice(enabled: boolean) {
    if (inFlight.current) return;
    if (enabled && requiresInstall) {
      await install();
      return;
    }
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
          await subscription.unsubscribe().catch(() => false);
        }
        setDelivery('off');
        return;
      }
      const permission =
        runtime.permission === 'granted' ? 'granted' : await runtime.requestPermission();
      if (permission !== 'granted') {
        if (permission === 'denied') setError('Notifications are blocked in browser settings.');
        return;
      }
      if (!publicKey) {
        setDelivery('allowed');
        return;
      }
      if (!service.supportsPush()) {
        setError(
          'This browser cannot send reminders. Try installing dwd or using another browser.',
        );
        return;
      }
      const subscription = await service.subscribe(publicKey);
      if (!subscription) throw new Error('Browser setup could not finish. Retry when connected.');
      const result = await registerPushSubscriptionAction(subscription);
      if (!result.ok) throw new Error(result.error);
      setDelivery('enabled');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Browser setup could not finish.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const deviceStatus =
    !runtime.ready || delivery === 'loading'
      ? 'Checking…'
      : requiresInstall
        ? 'Install to enable'
        : runtime.permission === 'denied'
          ? 'Blocked'
          : !runtime.pushSupported
            ? 'Unavailable'
            : delivery === 'enabled'
              ? 'On'
              : delivery === 'error'
                ? 'Could not check'
                : 'Off';
  return (
    <section
      className="notification-device stack"
      aria-label="Reminder setup"
      data-tour="reminders"
    >
      <div className="reminder-device-heading">
        <h3>Reminders on this device</h3>
        <span className={`pill${deviceStatus === 'On' ? ' pill-on' : ''}`} role="status">
          {deviceStatus}
        </span>
      </div>
      {deviceStatus === 'On' ? (
        <p className="muted small">You can receive reminders when dwd is closed.</p>
      ) : deviceStatus === 'Off' ? (
        <p className="muted small">
          Turn on notifications to receive reminders when dwd is closed.
        </p>
      ) : null}
      {requiresInstall ? (
        <>
          <p className="muted small">
            Install dwd before enabling reminders on this iPhone or iPad.
          </p>
          <Button type="button" disabled={busy} onClick={() => void install()}>
            Install dwd
          </Button>
        </>
      ) : delivery === 'enabled' ? (
        <div className="row">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => void changeDevice(false)}
          >
            Turn off on this device
          </Button>
        </div>
      ) : delivery === 'allowed' ? (
        <div className="stack">
          <p className="muted small">
            Reminders are temporarily unavailable. You can still see updates in dwd.
          </p>
        </div>
      ) : runtime.permission === 'denied' ? (
        <p className="error-box">Allow notifications in this site&apos;s browser settings.</p>
      ) : runtime.ready && !runtime.pushSupported ? (
        <p className="muted small">
          This browser cannot send reminders when dwd is closed. Try another browser.
        </p>
      ) : (
        <Button
          type="button"
          disabled={busy || !runtime.ready || delivery === 'loading'}
          onClick={() => void changeDevice(true)}
        >
          {busy ? 'Enabling…' : 'Enable reminders'}
        </Button>
      )}
      {instructions ? (
        <ol className="compact-list">
          {runtime.manualInstructions.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : null}
      {error ? (
        <p className="error-box" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
