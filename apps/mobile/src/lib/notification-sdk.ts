import Constants, { ExecutionEnvironment } from 'expo-constants';
import type * as Notifications from 'expo-notifications';

type NotificationSdk = typeof Notifications;
let sdk: Promise<NotificationSdk> | null = null;

export function loadNotificationSdk(): Promise<NotificationSdk | null> {
  // Importing the SDK itself installs a push-token listener. In Android Expo
  // Go that throws before any permission or provider-level guard can run.
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient)
    return Promise.resolve(null);
  // Permission sync, listener setup and notification taps can start together.
  // Share loading work, but allow another attempt if loading fails.
  sdk ??= import('expo-notifications').catch((error: unknown) => {
    sdk = null;
    throw error;
  });
  return sdk;
}
