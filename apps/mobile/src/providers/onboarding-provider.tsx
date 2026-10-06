import 'expo-sqlite/localStorage/install';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { introductionSeen, rememberIntroduction } from '@/lib/auth-routing';

const OnboardingContext = createContext<{
  seen: boolean;
  complete: () => void;
} | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [seen, setSeen] = useState(() => introductionSeen(globalThis.localStorage));
  const complete = useCallback(() => {
    rememberIntroduction(globalThis.localStorage);
    setSeen(true);
  }, []);
  const value = useMemo(() => ({ seen, complete }), [seen, complete]);
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const value = useContext(OnboardingContext);
  if (!value) throw new Error('useOnboarding requires OnboardingProvider.');
  return value;
}
