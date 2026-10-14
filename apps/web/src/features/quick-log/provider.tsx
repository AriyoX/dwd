'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'next/navigation';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { quickScope, type Database } from '@dwd/core';
import type { QuickLogStore } from '@dwd/contracts';
import { createBrowserSupabaseClient } from '@/lib/supabase/browser';
import { browserLocks, browserQuickStore, quickWriterName } from './local';
import { useAccountQuickSync } from './account-sync';

const Context = createContext<{
  store: QuickLogStore | null;
  writable: boolean;
  issue: string | null;
  session: Session | null;
  client: SupabaseClient<Database> | null;
  retry: () => void;
  pinGuest: () => void;
  syncIssue: string | null;
  retrySync: () => void;
} | null>(null);
export function QuickLogProvider({ children }: { children: ReactNode }) {
  const params = useSearchParams();
  const [pinnedGuest, setPinnedGuest] = useState(false);
  const pinRequested = useRef(false);
  const explicitScope = params.get('scope');
  useEffect(() => {
    if (explicitScope === 'account') {
      pinRequested.current = false;
      queueMicrotask(() => setPinnedGuest(false));
    }
  }, [explicitScope]);
  const [session, setSession] = useState<Session | null>(null);
  const [client, setClient] = useState<SupabaseClient<Database> | null>(null);
  const [handle, setHandle] = useState<{
    store: QuickLogStore | null;
    writable: boolean;
    issue: string | null;
  }>({ store: null, writable: false, issue: null });
  const [attempt, setAttempt] = useState(0);
  let scope =
    params.get('scope') === 'guest' || (pinnedGuest && params.get('scope') !== 'account')
      ? 'guest'
      : quickScope(session?.user.id);
  if (scope === 'guest' && session) {
    const guest = browserQuickStore('guest');
    const selected =
      guest.session(params.get('sessionId')) ??
      [...guest.getSnapshot().record.sessions]
        .reverse()
        .find((s) => s.claimedBy === session.user.id);
    if (
      selected?.claimedBy === session.user.id &&
      browserQuickStore(quickScope(session.user.id)).session(selected.id)
    )
      scope = quickScope(session.user.id);
  }
  const sync = useAccountQuickSync(session, client, handle.store, handle.writable);
  function pinGuest() {
    if (params.get('scope') === 'guest' || pinRequested.current) return;
    pinRequested.current = true;
    setPinnedGuest(true);
    const next = new URLSearchParams(params);
    next.set('scope', 'guest');
    window.history.replaceState(null, '', `${window.location.pathname}?${next.toString()}`);
  }
  const ageConfirmed = session?.user.user_metadata['age_confirmed'] === true;
  useEffect(() => {
    if (
      scope !== 'guest' &&
      ageConfirmed &&
      handle.writable &&
      handle.store?.scope === scope &&
      !handle.store.getSnapshot().record.eligible &&
      !handle.store.getSnapshot().blocked
    )
      handle.store.acknowledgeEligibility();
  }, [scope, ageConfirmed, handle]);
  useEffect(() => {
    let active = true;
    let connection: SupabaseClient<Database>;
    try {
      connection = createBrowserSupabaseClient();
    } catch {
      return;
    }
    queueMicrotask(() => {
      if (active) setClient(connection);
    });
    let version = 0;
    const { data } = connection.auth.onAuthStateChange((event, value) => {
      if (event !== 'INITIAL_SESSION' && active) {
        version++;
        setSession(value);
      }
    });
    void connection.auth
      .getSession()
      .then(({ data }) => {
        if (active && version === 0) setSession(data.session);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    let alive = true;
    let release: (() => void) | undefined;
    const controller = new AbortController();
    const store = browserQuickStore(scope);
    queueMicrotask(() => {
      if (alive) setHandle({ store, writable: false, issue: null });
    });
    const close = () => {
      alive = false;
      release?.();
      controller.abort();
    };
    const locks = browserLocks();
    if (!locks) {
      queueMicrotask(() => {
        if (alive)
          setHandle({
            store,
            writable: false,
            issue:
              'This browser can’t safely save Quick Log in multiple tabs. Open it in a current browser.',
          });
      });
      return close;
    }
    const waiting = setTimeout(() => {
      if (alive)
        setHandle({
          store,
          writable: false,
          issue: 'Quick Log is open in another tab. Close it there, then try again.',
        });
    }, 250);
    void locks
      .request(quickWriterName(scope), { signal: controller.signal }, async (lock) => {
        if (!alive) return;
        clearTimeout(waiting);
        if (!lock) {
          setHandle({
            store,
            writable: false,
            issue: 'Quick Log is open in another tab. Close it there, then try again.',
          });
          return;
        }
        store.reload();
        setHandle({ store, writable: true, issue: null });
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      })
      .catch(() => {
        if (alive)
          setHandle({ store, writable: false, issue: 'Couldn’t open device storage. Try again.' });
      });
    const hide = () => {
      close();
      setHandle({ store, writable: false, issue: null });
    };
    const show = (event: PageTransitionEvent) => {
      if (event.persisted) setAttempt((n) => n + 1);
    };
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    return () => {
      close();
      clearTimeout(waiting);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
    };
  }, [scope, attempt]);
  // Never render the previous account's record while its replacement lock is being acquired.
  const current =
    handle.store?.scope === scope ? handle : { store: null, writable: false, issue: null };
  return (
    <Context.Provider
      value={{
        ...current,
        session,
        client,
        pinGuest,
        syncIssue: sync.issue,
        retrySync: sync.retrySync,
        retry: () => setAttempt((n) => n + 1),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useBrowserQuickLog() {
  const context = useContext(Context);
  if (!context) throw new Error('Quick Log provider missing.');
  return context;
}
export function useQuickStoreState(store: QuickLogStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
