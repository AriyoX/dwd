import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dwd/core';
import { useSupabase } from '@/providers/supabase-provider';

// Focus, foreground, and pull-to-refresh share one request path. Stale responses never win.
export function useAccountQuery<T>(
  load: (client: SupabaseClient<Database>) => Promise<T>,
  scope = '',
) {
  const { client, session, status } = useSupabase();
  const [data, setData] = useState<{ owner: string; scope: string; value: T } | null>(null);
  const [loading, setLoading] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const focused = useRef(false);
  const version = useRef(0);
  const owner = session?.user.id;
  const refresh = useCallback(async () => {
    if (!client || !owner || status !== 'signed-in') return;
    const request = ++version.current;
    setLoading(true);
    try {
      const value = await load(client);
      if (focused.current && request === version.current) {
        setData({ owner, scope, value });
        setIssue(null);
      }
    } catch {
      if (focused.current && request === version.current)
        setIssue('Could not refresh. Check your connection and retry.');
    } finally {
      if (focused.current && request === version.current) setLoading(false);
    }
  }, [client, owner, status, load, scope]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      setIssue(null);
      setLoading(false);
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
    issue,
    refresh,
  };
}
