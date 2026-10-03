import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import {
  NativeLogOutbox,
  NativePendingLogStore,
  type NativePendingLog,
} from '@/lib/offline-logging';
import { nativeLogSender } from '@/lib/offline-logging-api';
import { useSupabase } from './supabase-provider';

interface OfflineContextValue {
  outbox: NativeLogOutbox | null;
  records: NativePendingLog[];
  issue: string | null;
  activityVersion: number;
  retry: () => Promise<void>;
}
const OfflineContext = createContext<OfflineContextValue | null>(null);

export function OfflineProvider({ children }: { children: ReactNode }) {
  const { client, session, access } = useSupabase();
  const owner = session?.user.id;
  const currentOwner = useRef(owner);
  const currentSession = useRef(session);
  useLayoutEffect(() => {
    currentSession.current = session;
  }, [session]);
  const [bundle, setBundle] = useState<{ owner: string; outbox: NativeLogOutbox } | null>(null);
  const [state, setState] = useState<{
    owner: string;
    records: NativePendingLog[];
    issue: string | null;
  } | null>(null);
  const [activityVersion, setActivityVersion] = useState(0);

  useLayoutEffect(() => {
    currentOwner.current = owner;
    if (!client || !owner || access !== 'ready') return;
    const store = new NativePendingLogStore(globalThis.localStorage, owner);
    let active = true;
    const current = () => active && currentOwner.current === owner;
    const publish = (synced: boolean) => {
      if (!current()) return;
      try {
        setState({ owner, records: store.getAll(), issue: null });
      } catch {
        setState({
          owner,
          records: [],
          issue: 'Could not read saved entries on this device. Retry.',
        });
      }
      if (synced) setActivityVersion((value) => value + 1);
    };
    const outbox = new NativeLogOutbox(
      store,
      nativeLogSender(
        client,
        current,
        () => AppState.currentState === 'active',
        () => {
          const value = currentSession.current;
          return value ? { actorUserId: value.user.id, accessToken: value.access_token } : null;
        },
      ),
      publish,
    );
    setBundle({ owner, outbox });
    publish(false);
    // Invalidate synchronously at the auth event, before React renders the next account.
    const subscription = client.auth.onAuthStateChange((_event, nextSession) => {
      currentSession.current = nextSession;
      if (nextSession?.user.id !== owner) {
        active = false;
        outbox.dispose();
      }
    }).data.subscription;
    return () => {
      active = false;
      outbox.dispose();
      subscription.unsubscribe();
    };
  }, [client, owner, access]);

  const outbox =
    bundle && bundle.owner === owner && access === 'ready' && bundle.outbox.current()
      ? bundle.outbox
      : null;
  const retry = useCallback(async () => {
    if (!outbox || AppState.currentState !== 'active') return;
    try {
      await outbox.retryAll();
    } catch {
      if (outbox.current() && owner)
        setState({
          owner,
          records: [],
          issue: 'Could not read saved entries on this device. Retry.',
        });
    }
  }, [outbox, owner]);
  useEffect(() => {
    const start = setTimeout(() => void retry(), 0);
    const timer = setInterval(() => void retry(), 15_000);
    const listener = AppState.addEventListener('change', (value) => {
      if (value === 'active') void retry();
    });
    return () => {
      clearTimeout(start);
      clearInterval(timer);
      listener.remove();
    };
  }, [retry]);

  return (
    <OfflineContext.Provider
      value={{
        outbox,
        records: state && state.owner === owner && access === 'ready' ? state.records : [],
        issue: state && state.owner === owner && access === 'ready' ? state.issue : null,
        activityVersion,
        retry,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  const value = useContext(OfflineContext);
  if (!value) throw new Error('useOffline must be used inside OfflineProvider.');
  return value;
}
