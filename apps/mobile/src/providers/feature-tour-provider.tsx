import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'expo-router';
import { FEATURE_TOUR_STEPS, type TourRoute } from '@/lib/feature-tour';

type TourSession = { index: number; returnTo: TourRoute };
type TourContextValue = {
  index: number | null;
  start: (returnTo?: TourRoute) => void;
  go: (index: number) => void;
  finish: () => void;
};
const TourContext = createContext<TourContextValue | null>(null);

export function useFeatureTour() {
  return useContext(TourContext);
}

export function FeatureTourProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<TourSession | null>(null);
  const arrived = useRef(false);
  const start = useCallback(
    (returnTo: TourRoute = '/') => {
      arrived.current = false;
      setSession({ index: 0, returnTo });
      // Remove the entry route so Back cannot reopen an already finished tour.
      router.dismissTo('/');
    },
    [router],
  );
  const go = useCallback(
    (index: number) => {
      const step = FEATURE_TOUR_STEPS[index];
      if (!step || !session) return;
      arrived.current = false;
      setSession({ ...session, index });
      router.navigate(step.route);
    },
    [router, session],
  );
  const finish = useCallback(() => {
    if (!session) return;
    setSession(null);
    router.dismissTo(session.returnTo);
  }, [router, session]);

  useEffect(() => {
    if (!session) return;
    if (pathname === FEATURE_TOUR_STEPS[session.index]?.route) {
      arrived.current = true;
    } else if (arrived.current) {
      // A tab, header Back, or deep link ends the tour instead of leaving a
      // dormant coach mark that reappears when this screen is revisited.
      let active = true;
      queueMicrotask(() => {
        if (active) setSession(null);
      });
      return () => {
        active = false;
      };
    }
  }, [pathname, session]);

  return (
    <TourContext.Provider value={{ index: session?.index ?? null, start, go, finish }}>
      {children}
    </TourContext.Provider>
  );
}
