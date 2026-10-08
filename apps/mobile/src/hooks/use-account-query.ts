import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dwd/core';
import { useSupabase } from '@/providers/supabase-provider';
import { useConnectivity } from '@/providers/connectivity-provider';
import { withRequestTimeout } from '@/lib/request-timeout';
import { actorClient } from '@/lib/actor-client';
import {
  clearOfflineCache,
  isConnectionFailure,
  readOfflineCache,
  writeOfflineCache,
} from '@/lib/offline-cache';

// Focus, foreground, and pull-to-refresh share one request path. Stale responses never win.
export function useAccountQuery<T>(
  load: (client: SupabaseClient<Database>) => Promise<T>,
  scope = '',
  cache = false,
  allowIncompleteAccount = false,
  onLoaded?: (value: T) => void,
) {
  const { client, session, status } = useSupabase();
  const { online } = useConnectivity();
  const [data, setData] = useState<{ owner: string; scope: string; value: T } | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const focused = useRef(false);
  const version = useRef(0);
  const owner = session?.user.id;
  const accessToken = session?.access_token;
  // Inline loaders must not restart the focus effect on every render.
  const loader = useRef({ load, onLoaded });
  useLayoutEffect(() => {
    loader.current = { load, onLoaded };
  }, [load, onLoaded]);
  const refresh = useCallback(
    async (visible = false) => {
      if (
        !client ||
        !owner ||
        !accessToken ||
        (status !== 'signed-in' && !(allowIncompleteAccount && status === 'onboarding'))
      )
        return;
      const request = ++version.current;
      setLoading(true);
      if (visible) setRefreshing(true);
      const currentLoader = loader.current;
      try {
        if (online === false) throw new Error('offline');
        const value = await withRequestTimeout((signal) =>
          currentLoader.load(actorClient(client, accessToken, signal)),
        );
        if (focused.current && request === version.current) {
          if (cache) writeOfflineCache(globalThis.localStorage, owner, scope, value);
          currentLoader.onLoaded?.(value);
          setData({ owner, scope, value });
          setCached(false);
          setIssue(null);
        }
      } catch (error) {
        if (focused.current && request === version.current) {
          const connectionFailure = isConnectionFailure(error);
          const saved =
            cache && connectionFailure
              ? (readOfflineCache(globalThis.localStorage, owner, scope) as T | null)
              : null;
          if (saved !== null) {
            setData({ owner, scope, value: saved });
            setCached(true);
            setIssue("You're offline. Showing saved entries.");
          } else {
            if (cache && !connectionFailure) {
              clearOfflineCache(globalThis.localStorage, owner, scope);
              setData(null);
            }
            setIssue(
              connectionFailure
                ? 'Connect to the internet to continue.'
                : "Couldn't load this. Try again.",
            );
          }
        }
      } finally {
        if (focused.current && request === version.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [client, owner, accessToken, status, scope, cache, allowIncompleteAccount, online],
  );
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      setIssue(null);
      setLoading(false);
      setRefreshing(false);
      void refresh();
      const listener = AppState.addEventListener('change', (state) => {
        if (state === 'active') void refresh();
      });
      return () => {
        focused.current = false;
        version.current++;
        listener.remove();
      };
    }, [refresh]),
  );
  return {
    data: data && data.owner === owner && data.scope === scope ? data.value : null,
    loading,
    refreshing,
    issue,
    cached,
    refresh,
  };
}
