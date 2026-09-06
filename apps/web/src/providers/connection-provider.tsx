'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface ConnectionContextValue {
  online: boolean;
  activityVersion: number;
}

const ConnectionContext = createContext<ConnectionContextValue>({
  online: true,
  activityVersion: 0,
});

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [activityVersion, setActivityVersion] = useState(0);

  useEffect(() => {
    const refresh = () => setActivityVersion((value) => value + 1);
    const handleOnline = () => {
      setOnline(true);
      refresh();
    };
    const handleOffline = () => setOnline(false);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    queueMicrotask(() => setOnline(navigator.onLine));
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const value = useMemo(() => ({ online, activityVersion }), [online, activityVersion]);
  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection(): ConnectionContextValue {
  return useContext(ConnectionContext);
}
