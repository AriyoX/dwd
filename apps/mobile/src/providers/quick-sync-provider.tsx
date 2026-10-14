import { AppState } from 'react-native';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { synchronizeQuickLogs } from '@dwd/contracts';
import { quickScope } from '@dwd/core';
import { getQuickSessions, saveQuickSession } from '@dwd/data';
import { nativeQuickStore } from '@/lib/quick-log';
import { actorClient } from '@/lib/actor-client';
import { withRequestTimeout } from '@/lib/request-timeout';
import { useSupabase } from './supabase-provider';
import { useConnectivity } from './connectivity-provider';

const Context = createContext({ issue: null as string | null, retrySync: () => {} });
export const useQuickSync = () => useContext(Context);
export function QuickSyncProvider({ children }: { children: ReactNode }) {
  const { session, client } = useSupabase();
  const { online } = useConnectivity();
  const current = useRef(session);
  useLayoutEffect(() => {
    current.current = session;
  }, [session]);
  const [issue, setIssue] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const owner = session?.user.id;
  useEffect(() => {
    if (!owner || !client) return;
    let alive = true,
      busy = false,
      retryAfter = 0;
    const isCurrent = () => alive && current.current?.user.id === owner;
    let timer: ReturnType<typeof setTimeout>;
    const guest = nativeQuickStore('guest'),
      account = nativeQuickStore(quickScope(owner));
    const run = async () => {
      if (!alive || busy || Date.now() < retryAfter) return;
      const credentials = current.current;
      if (!credentials || credentials.user.id !== owner) return;
      busy = true;
      try {
        const completed = await synchronizeQuickLogs({
          guest,
          account,
          accountId: owner,
          currentAccount: () => (alive ? (current.current?.user.id ?? null) : null),
          mutate: (work) => {
            work();
            return Promise.resolve();
          },
          online: online !== false,
          save: (s, e) =>
            withRequestTimeout((signal) =>
              saveQuickSession(actorClient(client, credentials.access_token, signal), s, e),
            ),
          list: () =>
            withRequestTimeout((signal) =>
              getQuickSessions(actorClient(client, credentials.access_token, signal)),
            ),
        });
        if (!completed) {
          if (isCurrent()) {
            setIssue('Account saving is pending. Your logs are kept on this device.');
            timer = setTimeout(() => void run(), 650);
          }
          return;
        }
        if (isCurrent())
          setIssue(
            online === false
              ? 'Account saving is pending. Your logs are kept on this device.'
              : null,
          );
      } catch (error) {
        retryAfter = Date.now() + 30_000;
        if (isCurrent())
          setIssue(
            error instanceof Error && /another|device|night/.test(error.message)
              ? error.message
              : 'Account saving is pending. Your logs are kept on this device.',
          );
      } finally {
        busy = false;
      }
    };
    let signature = '';
    const changed = () => {
      const next = JSON.stringify([guest.getSnapshot().record, account.getSnapshot().record]);
      if (next === signature) return;
      signature = next;
      clearTimeout(timer);
      timer = setTimeout(() => void run(), 650);
    };
    const offGuest = guest.subscribe(changed),
      offAccount = account.subscribe(changed);
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        retryAfter = 0;
        void run();
      }
    });
    const retryTimer = setInterval(() => void run(), 30_000);
    void run();
    return () => {
      alive = false;
      offGuest();
      offAccount();
      foreground.remove();
      clearTimeout(timer);
      clearInterval(retryTimer);
    };
  }, [owner, client, online, attempt]);
  return (
    <Context.Provider
      value={{ issue: owner ? issue : null, retrySync: () => setAttempt((n) => n + 1) }}
    >
      {children}
    </Context.Provider>
  );
}
