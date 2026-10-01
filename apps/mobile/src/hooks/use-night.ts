import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getNightSnapshot, getFinishedNightSummary } from '@dwd/data';
import { REALTIME_SUBSCRIBE_STATES, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dwd/core';
import { useSupabase } from '@/providers/supabase-provider';
import { useAccountQuery } from './use-account-query';

export function useNight(nightId: string, recap = false) {
  const { client, session } = useSupabase();
  const accessToken = session?.access_token;
  const load = useCallback(
    (connection: SupabaseClient<Database>) =>
      recap ? getFinishedNightSummary(connection, nightId) : getNightSnapshot(connection, nightId),
    [nightId, recap],
  );
  const query = useAccountQuery(load, `${nightId}:${recap}`);
  const refresh = query.refresh;
  const [connected, setConnected] = useState(false);
  const memberIds =
    query.data?.members
      .map((m) => m.id)
      .sort()
      .join(',') ?? '';
  useFocusEffect(
    useCallback(() => {
      if (!client || !accessToken || recap) return;
      let active = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const invalidate = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          if (active && AppState.currentState === 'active') void refresh();
        }, 150);
      };
      setConnected(false);
      let channel = client.channel(`mobile-night:${nightId}`);
      for (const table of [
        'nights',
        'night_members',
        'drink_logs',
        'water_logs',
        'night_alerts',
        'shared_bottles',
      ] as const) {
        channel = channel.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table,
            filter: `${table === 'nights' ? 'id' : 'night_id'}=eq.${nightId}`,
          },
          invalidate,
        );
      }
      if (memberIds)
        channel = channel.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'drink_plan_items',
            filter: `night_member_id=in.(${memberIds})`,
          },
          invalidate,
        );
      void client.realtime
        .setAuth(accessToken)
        .then(() => {
          if (active)
            channel.subscribe((state) => {
              if (!active) return;
              setConnected(state === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
              if (state === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) invalidate();
            });
        })
        .catch(() => {
          if (active) setConnected(false);
        });
      const reconcile = setInterval(invalidate, 15_000);
      return () => {
        active = false;
        if (timer) clearTimeout(timer);
        clearInterval(reconcile);
        void client.removeChannel(channel);
      };
    }, [client, accessToken, nightId, memberIds, recap, refresh]),
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return { ...query, snapshot: query.data, connected, now };
}
