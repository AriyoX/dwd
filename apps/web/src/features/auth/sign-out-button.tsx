'use client';

import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { signOutAction } from './actions';
import { removePushSubscriptionAction } from '@/features/notifications/actions';

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  async function signOut() {
    if (pending) return;
    setPending(true);
    try {
      const registration =
        'serviceWorker' in navigator
          ? await navigator.serviceWorker.getRegistration('/').catch(() => null)
          : null;
      const subscription =
        registration === null || registration === undefined
          ? null
          : await registration.pushManager.getSubscription().catch(() => null);
      if (subscription?.endpoint) {
        await removePushSubscriptionAction(subscription.endpoint);
        await subscription.unsubscribe().catch(() => false);
      }
      if (registration) {
        const notifications = await registration.getNotifications().catch(() => []);
        notifications.forEach((notification) => notification.close());
      }
    } finally {
      await signOutAction();
    }
  }
  return (
    <button
      className="icon-text-button"
      type="button"
      disabled={pending}
      onClick={() => void signOut()}
    >
      <LogOut aria-hidden="true" size={18} /> {pending ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
