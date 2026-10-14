'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { synchronizeQuickLogs, type QuickLogStore } from '@dwd/contracts';
import { quickScope, type Database } from '@dwd/core';
import { getQuickSessions, saveQuickSession } from '@dwd/data';
import { createBrowserSupabaseClient } from '@/lib/supabase/browser';
import { browserLocks, browserQuickStore, quickWriterName } from './local';

export function useAccountQuickSync(
  session: Session | null,
  client: SupabaseClient<Database> | null,
  held: QuickLogStore | null = null,
  writable = false,
) {
  const current = useRef({ session, held, writable });
  useLayoutEffect(() => {
    current.current = { session, held, writable };
  });
  const [issue, setIssue] = useState<string | null>(null);
  const [, refresh] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const owner = session?.user.id;
  const heldScope = held?.scope;
  useEffect(() => {
    if (!owner || !client || (held && !writable)) return;
    let alive = true,
      busy = false,
      retryAfter = 0;
    const isCurrent = () => alive && current.current.session?.user.id === owner;
    let timer: ReturnType<typeof setTimeout>;
    const guest = browserQuickStore('guest'),
      account = browserQuickStore(quickScope(owner));
    const mutate = async (work: () => void) => {
      const locks = browserLocks();
      if (!locks)
        throw new Error('Open Quick Log in a current browser to save your account history.');
      const acquire = async (store: QuickLogStore, next: () => Promise<void>) => {
        if (current.current.held === store && current.current.writable) {
          await next();
          return;
        }
        await locks.request(quickWriterName(store.scope), { ifAvailable: true }, async (lock) => {
          if (!lock)
            throw new Error('Close Quick Log in another tab to save your account history.');
          await next();
        });
      };
      await acquire(guest, () =>
        acquire(account, () => {
          if (!alive || current.current.session?.user.id !== owner)
            throw new Error('Account changed.');
          guest.reload();
          account.reload();
          work();
          if (isCurrent()) refresh((n) => n + 1);
          return Promise.resolve();
        }),
      );
    };
    const run = async () => {
      if (!alive || busy || Date.now() < retryAfter) return;
      const credentials = current.current.session;
      if (!credentials || credentials.user.id !== owner) return;
      busy = true;
      const scoped = Object.create(client) as typeof client;
      scoped.rpc = (fn, args, options) =>
        client
          .rpc(fn, args, options)
          .setHeader('Authorization', `Bearer ${credentials.access_token}`)
          .abortSignal(AbortSignal.timeout(20_000));
      try {
        const completed = await synchronizeQuickLogs({
          guest,
          account,
          accountId: owner,
          currentAccount: () => (alive ? (current.current.session?.user.id ?? null) : null),
          mutate,
          online: navigator.onLine,
          save: (s, e) => saveQuickSession(scoped, s, e),
          list: () => getQuickSessions(scoped),
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
            navigator.onLine
              ? null
              : 'Account saving is pending. Your logs are kept on this device.',
          );
      } catch (error) {
        retryAfter = Date.now() + 30_000;
        if (isCurrent())
          setIssue(
            error instanceof Error && /another|device|browser|night/.test(error.message)
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
      if (signature === next) return;
      signature = next;
      clearTimeout(timer);
      timer = setTimeout(() => void run(), 650);
    };
    const resume = () => {
      retryAfter = 0;
      void run();
    };
    const offGuest = guest.subscribe(changed),
      offAccount = account.subscribe(changed);
    window.addEventListener('online', resume);
    window.addEventListener('focus', resume);
    const retryTimer = setInterval(() => void run(), 30_000);
    void run();
    return () => {
      alive = false;
      clearTimeout(timer);
      clearInterval(retryTimer);
      offGuest();
      offAccount();
      window.removeEventListener('online', resume);
      window.removeEventListener('focus', resume);
    };
    // The current token and held writer are read at each operation, never borrowed after cleanup.
  }, [owner, client, held, heldScope, writable, attempt]);
  return { issue: owner ? issue : null, retrySync: () => setAttempt((n) => n + 1) };
}

/** Auth, profile completion and invitations also associate guests, without changing their destination. */
export function AccountQuickSync() {
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [client, setClient] = useState<SupabaseClient<Database> | null>(null);
  useEffect(() => {
    let alive = true;
    let connection: SupabaseClient<Database>;
    try {
      connection = createBrowserSupabaseClient();
    } catch {
      return;
    }
    queueMicrotask(() => {
      if (alive) setClient(connection);
    });
    const { data } = connection.auth.onAuthStateChange((_, value) => {
      if (alive) setSession(value);
    });
    void connection.auth
      .getSession()
      .then(({ data }) => {
        if (alive) setSession(data.session);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!client) return;
    let active = true;
    // Server actions and OAuth callbacks update cookies without emitting a browser auth event.
    void client.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSession(data.session);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [client, pathname]);
  const quickPage = pathname === '/' || pathname.startsWith('/quick-log');
  useAccountQuickSync(quickPage ? null : session, client);
  return null;
}
