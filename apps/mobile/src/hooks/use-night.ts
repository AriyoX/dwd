import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getNightSnapshot, getFinishedNightSummary } from '@dwd/data';
import { REALTIME_SUBSCRIBE_STATES, type SupabaseClient } from '@supabase/supabase-js';
import type { Database, NightSnapshot } from '@dwd/core';
import { useSupabase } from '@/providers/supabase-provider';
import { useAccountQuery } from './use-account-query';
import { useOffline } from '@/providers/offline-provider';

export function useNight(nightId: string, recap = false) {
  const { client, session } = useSupabase();
  const { activityVersion, retry, outbox } = useOffline();
  const accessToken = session?.access_token;
  const readVersions = useRef(new WeakMap<NightSnapshot, number>());
  const load = useCallback(
    async (connection: SupabaseClient<Database>) => {
      const readVersion = outbox?.acceptedVersion() ?? 0;
      const result = await (recap
        ? getFinishedNightSummary(connection, nightId)
        : getNightSnapshot(connection, nightId));
      readVersions.current.set(result, readVersion);
      return result;
    },
    [nightId, recap, outbox],
  );
  const onLoaded = useCallback(
    (snapshot: NightSnapshot) => {
      // Only an applied response may release the bridge. A superseded read cannot.
      outbox?.reconcileAccepted(snapshot, readVersions.current.get(snapshot) ?? 0);
    },
    [outbox],
  );
  const query = useAccountQuery(load, `${nightId}:${recap}`, true, false, onLoaded);
  const refresh = query.refresh;
  useEffect(() => {
    if (activityVersion > 0) void refresh();
  }, [activityVersion, refresh]);
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
              if (state === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
                invalidate();
                void retry();
              }
            });
        })
        .catch(() => {
          if (active) setConnected(false);
        });
      // Undone logs no longer pass SELECT policies, so Realtime may hide their update.
      // Reconcile silently even with a healthy subscription to reflect remote undo.
      const reconcile = setInterval(invalidate, 15_000);
      return () => {
        active = false;
        if (timer) clearTimeout(timer);
        clearInterval(reconcile);
        void client.removeChannel(channel);
      };
    }, [client, accessToken, nightId, memberIds, recap, refresh, retry]),
  );
  const now = useNow();
  const snapshot = useMemo(
    () => query.data && (outbox?.withAccepted(query.data) ?? query.data),
    // A successful write updates the bridge without waiting for another read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query.data, outbox, activityVersion],
  );
  return { ...query, snapshot, connected, now };
}

export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = setInterval(update, 15_000);
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') update();
    });
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, []);
  return now;
}
