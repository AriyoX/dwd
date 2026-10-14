import { useEffect, useSyncExternalStore } from 'react';
import { quickScope, type QuickScope } from '@dwd/core';
import { nativeQuickStore } from '@/lib/quick-log';
import { useSupabase } from '@/providers/supabase-provider';

export function useQuickLog(guest = false) {
  const { session } = useSupabase();
  const scope: QuickScope = guest ? 'guest' : quickScope(session?.user.id);
  const store = nativeQuickStore(scope);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const ageConfirmed = session?.user.user_metadata['age_confirmed'] === true;
  useEffect(() => {
    if (scope !== 'guest' && ageConfirmed && !state.record.eligible && !state.blocked)
      store.acknowledgeEligibility();
  }, [scope, ageConfirmed, state.record.eligible, state.blocked, store]);
  return { store, state, scope };
}
