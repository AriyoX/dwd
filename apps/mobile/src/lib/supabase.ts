import 'expo-sqlite/localStorage/install';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dwd/core';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { createSecureAuthStorage } from './secure-auth-storage';
import { nativeSessionKey, readOfflineSession } from './offline-session';

let client: SupabaseClient<Database> | null | undefined;
let authStorage: ReturnType<typeof createSecureAuthStorage> | undefined;
const storage = () =>
  (authStorage ??= createSecureAuthStorage(
    {
      getItemAsync: (key) => SecureStore.getItemAsync(key),
      setItemAsync: (key, value) =>
        SecureStore.setItemAsync(key, value, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        }),
      deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
    },
    globalThis.localStorage,
    Crypto.randomUUID,
  ));

export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (client !== undefined) return client;

  // Expo only inlines EXPO_PUBLIC variables accessed with static dot notation.
  const url: unknown = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey: unknown = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (
    typeof url !== 'string' ||
    typeof publishableKey !== 'string' ||
    !url ||
    !publishableKey ||
    url.includes('YOUR_') ||
    publishableKey.includes('REPLACE_ME')
  ) {
    client = null;
    return client;
  }

  client = createClient<Database>(url, publishableKey, {
    auth: {
      storageKey: nativeSessionKey(url),
      storage: storage(),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });

  return client;
}

export async function restoreOfflineSession(error: unknown) {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    const key = nativeSessionKey(url);
    const raw = await storage().getItem(key);
    return readOfflineSession({ getItem: () => raw }, key, error);
  } catch {
    return null;
  }
}
