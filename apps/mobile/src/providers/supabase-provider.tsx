import { AppState } from 'react-native';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dwd/core';
import { getSupabaseClient } from '@/lib/supabase';

export type AuthStatus = 'loading' | 'unconfigured' | 'signed-in' | 'signed-out' | 'error';

interface SupabaseContextValue {
  client: SupabaseClient<Database> | null;
  session: Session | null;
  status: AuthStatus;
  issue: string | null;
}

const SupabaseContext = createContext<SupabaseContextValue | null>(null);

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const client = useMemo(getSupabaseClient, []);
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>(client ? 'loading' : 'unconfigured');
  const [issue, setIssue] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;

    let mounted = true;
    const authSubscription = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setStatus(nextSession ? 'signed-in' : 'signed-out');
      setIssue(null);
    }).data.subscription;

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    });

    if (AppState.currentState === 'active') client.auth.startAutoRefresh();
    else client.auth.stopAutoRefresh();

    void client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!mounted) return;
        setSession(data.session);
        setStatus(error ? 'error' : data.session ? 'signed-in' : 'signed-out');
        setIssue(error ? 'Could not restore your session. Sign in again.' : null);
      })
      .catch(() => {
        if (!mounted) return;
        setSession(null);
        setStatus('error');
        setIssue('Could not restore your session. Sign in again.');
      });

    return () => {
      mounted = false;
      authSubscription.unsubscribe();
      appStateSubscription.remove();
      client.auth.stopAutoRefresh();
    };
  }, [client]);

  const value = useMemo(
    () => ({ client, session, status, issue }),
    [client, session, status, issue],
  );

  return <SupabaseContext.Provider value={value}>{children}</SupabaseContext.Provider>;
}

export function useSupabase(): SupabaseContextValue {
  const context = useContext(SupabaseContext);
  if (!context) throw new Error('useSupabase must be used inside SupabaseProvider.');
  return context;
}
