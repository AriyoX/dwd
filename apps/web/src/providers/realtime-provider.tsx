'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { REALTIME_SUBSCRIBE_STATES } from '@supabase/realtime-js';
import { createBrowserSupabaseClient } from '@/lib/supabase/browser';
import { useConnection } from './connection-provider';

export type RealtimeStatus = 'connected' | 'reconnecting' | 'offline';
const RealtimeContext = createContext<RealtimeStatus>('reconnecting');

export function NightRealtimeProvider({
  nightId,
  memberIds,
  onInvalidate,
  children,
}: {
  nightId: string;
  memberIds: readonly string[];
  onInvalidate: () => void | Promise<void>;
  children: ReactNode;
}) {
  const { online, activityVersion } = useConnection();
  const [status, setStatus] = useState<RealtimeStatus>('reconnecting');
  const invalidateRef = useRef(onInvalidate);
  const memberFilter = useMemo(() => memberIds.join(','), [memberIds]);

  useEffect(() => {
    invalidateRef.current = onInvalidate;
  }, [onInvalidate]);

  useEffect(() => {
    if (!online) return;
    queueMicrotask(() => setStatus('reconnecting'));
    const supabase = createBrowserSupabaseClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const invalidate = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => void invalidateRef.current(), 250);
    };
    let channel = supabase
      .channel(`night:${nightId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'nights', filter: `id=eq.${nightId}` },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'night_members', filter: `night_id=eq.${nightId}` },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'drink_logs', filter: `night_id=eq.${nightId}` },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'water_logs', filter: `night_id=eq.${nightId}` },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'night_alerts', filter: `night_id=eq.${nightId}` },
        invalidate,
      );

    if (memberFilter.length > 0) {
      channel = channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'drink_plan_items',
          filter: `night_member_id=in.(${memberFilter})`,
        },
        invalidate,
      );
    }

    channel.subscribe((subscriptionStatus) => {
      if (subscriptionStatus === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) setStatus('connected');
      else if (
        subscriptionStatus === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
        subscriptionStatus === REALTIME_SUBSCRIBE_STATES.TIMED_OUT
      ) {
        setStatus('reconnecting');
      } else {
        setStatus(navigator.onLine ? 'reconnecting' : 'offline');
      }
    });

    // A subscribed socket is not proof every invalidation was delivered.
    // Recover snapshots periodically while the user is viewing this night.
    const reconcileTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') invalidate();
    }, 15_000);

    return () => {
      if (timer !== undefined) clearTimeout(timer);
      window.clearInterval(reconcileTimer);
      void supabase.removeChannel(channel);
    };
  }, [nightId, memberFilter, online]);

  useEffect(() => {
    if (activityVersion > 0 && online) void invalidateRef.current();
  }, [activityVersion, online]);

  return (
    <RealtimeContext.Provider value={online ? status : 'offline'}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtimeStatus(): RealtimeStatus {
  return useContext(RealtimeContext);
}
