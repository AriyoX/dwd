import { useEffect, useSyncExternalStore } from 'react';
import { quickScope, type QuickScope } from '@dwd/core';
import { nativeQuickStore } from '@/lib/quick-log';
import { useSupabase } from '@/providers/supabase-provider';

export function useQuickLog(guest = false, selectedId?: string) {
  const { session } = useSupabase();
  let scope: QuickScope = guest ? 'guest' : quickScope(session?.user.id);
  if (guest && session) {
    const record = nativeQuickStore('guest').getSnapshot().record;
    const source =
      record.sessions.find((s) => s.id === (selectedId ?? record.activeSessionId)) ??
      [...record.sessions].reverse().find((s) => s.claimedBy === session.user.id);
    if (
      source?.claimedBy === session.user.id &&
      nativeQuickStore(quickScope(session.user.id)).session(source.id)
    )
      scope = quickScope(session.user.id);
  }
  const store = nativeQuickStore(scope);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const ageConfirmed = session?.user.user_metadata['age_confirmed'] === true;
  useEffect(() => {
    if (scope !== 'guest' && ageConfirmed && !state.record.eligible && !state.blocked)
      store.acknowledgeEligibility();
  }, [scope, ageConfirmed, state.record.eligible, state.blocked, store]);
  return { store, state, scope };
}
