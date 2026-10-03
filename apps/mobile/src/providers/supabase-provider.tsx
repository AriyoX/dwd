import { AppState } from 'react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dwd/core';
import { getSupabaseClient } from '@/lib/supabase';
import { accountAccess, type AccessState } from '@/lib/auth-routing';
import { resolveProfileRead } from '@/lib/offline-cache';

export type AuthStatus =
  'loading' | 'unconfigured' | 'signed-in' | 'signed-out' | 'error' | 'onboarding';
type ProfileStatus = 'loading' | 'complete' | 'incomplete' | 'error';
const RECOVERY_KEY = 'dwd.mobile.recovery-user';

interface SupabaseContextValue {
  client: SupabaseClient<Database> | null;
  session: Session | null;
  status: AuthStatus;
  issue: string | null;
  profileStatus: ProfileStatus;
  refreshProfile: () => void;
  recovering: boolean;
  markRecovery: (userId: string | null) => void;
  access: AccessState;
}

const SupabaseContext = createContext<SupabaseContextValue | null>(null);

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => getSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>(client ? 'loading' : 'unconfigured');
  const [issue, setIssue] = useState<string | null>(null);
  const [profile, setProfile] = useState<{
    owner: string;
    status: ProfileStatus;
    version: number;
  } | null>(null);
  const [profileVersion, setProfileVersion] = useState(0);
  const [recoveryUser, setRecoveryUser] = useState<string | null>(() =>
    globalThis.localStorage.getItem(RECOVERY_KEY),
  );
  const refreshProfile = useCallback(() => setProfileVersion((value) => value + 1), []);
  const markRecovery = useCallback((userId: string | null) => {
    if (userId) globalThis.localStorage.setItem(RECOVERY_KEY, userId);
    else globalThis.localStorage.removeItem(RECOVERY_KEY);
    setRecoveryUser(userId);
  }, []);
  const owner = session?.user.id;
  const profileStatus =
    profile && profile.owner === owner && profile.version === profileVersion
      ? profile.status
      : 'loading';
  const recovering = Boolean(owner && recoveryUser === owner);
  const access = accountAccess({
    restoring: status === 'loading',
    signedIn: Boolean(session),
    profile: profileStatus,
    recovering,
  });

  useEffect(() => {
    if (!client || !owner) return;
    let current = true;
    const settle = (found: boolean, error: unknown) => {
      if (current)
        setProfile({
          owner,
          version: profileVersion,
          status: resolveProfileRead(globalThis.localStorage, owner, found, error),
        });
    };
    void client
      .from('profiles')
      .select('id')
      .eq('id', owner)
      .maybeSingle()
      .then(
        ({ data, error }) => {
          settle(Boolean(data), error);
        },
        (error: unknown) => {
          settle(false, error);
        },
      );
    return () => {
      current = false;
    };
  }, [client, owner, profileVersion]);

  useEffect(() => {
    if (!client) return;

    let mounted = true;
    let authVersion = 0;
    const authSubscription = client.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      authVersion++;
      setSession(nextSession);
      setStatus(nextSession ? 'signed-in' : 'signed-out');
      setIssue(null);
      if (event === 'PASSWORD_RECOVERY' && nextSession) markRecovery(nextSession.user.id);
      if (!nextSession) {
        markRecovery(null);
        setProfile(null);
      }
    }).data.subscription;

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void client.auth.startAutoRefresh();
      else void client.auth.stopAutoRefresh();
    });

    if (AppState.currentState === 'active') void client.auth.startAutoRefresh();
    else void client.auth.stopAutoRefresh();

    const initialVersion = authVersion;
    void client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!mounted || authVersion !== initialVersion) return;
        setSession(data.session);
        if (!data.session) markRecovery(null);
        setStatus(error ? 'error' : data.session ? 'signed-in' : 'signed-out');
        setIssue(error ? 'Could not restore your session. Sign in again.' : null);
      })
      .catch(() => {
        if (!mounted || authVersion !== initialVersion) return;
        setSession(null);
        markRecovery(null);
        setStatus('error');
        setIssue('Could not restore your session. Sign in again.');
      });

    return () => {
      mounted = false;
      authSubscription.unsubscribe();
      appStateSubscription.remove();
      void client.auth.stopAutoRefresh();
    };
  }, [client, markRecovery]);

  const value = useMemo(
    () => ({
      client,
      session,
      status: session && profileStatus !== 'complete' ? ('onboarding' as const) : status,
      issue,
      profileStatus,
      refreshProfile,
      recovering,
      markRecovery,
      access,
    }),
    [
      client,
      session,
      status,
      issue,
      profileStatus,
      refreshProfile,
      markRecovery,
      recovering,
      access,
    ],
  );

  return <SupabaseContext.Provider value={value}>{children}</SupabaseContext.Provider>;
}

export function useSupabase(): SupabaseContextValue {
  const context = useContext(SupabaseContext);
  if (!context) throw new Error('useSupabase must be used inside SupabaseProvider.');
  return context;
}
