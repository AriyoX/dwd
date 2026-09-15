'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PrefetchKind } from 'next/dist/client/components/router-reducer/router-reducer-types';
import { Compass } from 'lucide-react';
import type { NightSnapshot } from '@dwd/core';
import { createTourNight } from './sample-state';
import { canChangeTourInPlace, normalReturnPath, stepAtLocation, tourSteps } from './steps';
import { CoachMark } from './coach-mark';
import { InstallHint } from '@/features/install/install-hint';

interface TourSession {
  returnTo: string;
}
interface TourContextValue {
  ready: boolean;
  active: boolean;
  sample: NightSnapshot | null;
  setSample: Dispatch<SetStateAction<NightSnapshot | null>>;
  start: () => void;
  goTo: (id: string) => void;
}
const TourContext = createContext<TourContextValue | null>(null);
export function useTour() {
  return useContext(TourContext);
}

export function TourButton({ className = 'text-link' }: { className?: string }) {
  const tour = useTour();
  return (
    <button
      type="button"
      className={`${className} tour-trigger`}
      disabled={!tour?.ready}
      onClick={(event) => {
        event.currentTarget.closest('details')?.removeAttribute('open');
        tour?.start();
      }}
    >
      <Compass size={18} aria-hidden="true" /> Take a tour
    </button>
  );
}

export function TourProvider({
  userId,
  seen,
  children,
}: {
  userId: string;
  seen: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const location = `${pathname}${search ? `?${search}` : ''}`;
  const [session, setSession] = useState<TourSession | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [sample, setSample] = useState<NightSnapshot | null>(null);
  const [destination, setDestination] = useState<string | null>(null);
  const [returnDestination, setReturnDestination] = useState<string | null>(null);
  const bootstrapped = useRef(false);
  const acknowledged = useRef(seen);
  const saving = useRef(false);
  const prefetched = useRef(new Set<string>());
  const sessionKey = `dwd-tour-session:${userId}`;
  const seenKey = `dwd-tour-seen:${userId}`;
  const stepIndex = stepAtLocation(pathname, search);
  const step = stepIndex < 0 ? undefined : tourSteps[stepIndex];

  const goTo = useCallback(
    (id: string) => {
      const next = tourSteps.find((item) => item.id === id);
      if (!next) return;
      setDestination(next.route);
      if (canChangeTourInPlace(window.location.pathname, next.route)) {
        // Next synchronizes search params without refetching the current page.
        window.history.replaceState(null, '', next.route);
      } else router.replace(next.route, { scroll: false });
    },
    [router, setDestination],
  );

  useEffect(() => {
    if (!session || stepIndex < 0) return;
    // Warm the next distinct screen while the user reads, including a clickable follow-up.
    // Same-screen options need no network request; don't prefetch every query variation.
    const nextScreen = tourSteps
      .slice(stepIndex + 1)
      .find((item) => new URL(item.route, 'https://tour.invalid').pathname !== pathname);
    for (const route of [nextScreen?.route, step?.follow?.route]) {
      if (!route || prefetched.current.has(route)) continue;
      prefetched.current.add(route);
      router.prefetch(route, {
        // Next 16.2 requires FULL to preload dynamic screens beyond their loading boundary.
        kind: PrefetchKind.FULL,
        onInvalidate: () => {
          prefetched.current.delete(route);
        },
      });
    }
  }, [pathname, router, session, step, stepIndex]);

  const start = useCallback(() => {
    const nextSession = {
      returnTo: normalReturnPath(
        `${window.location.pathname}${window.location.search}${window.location.hash}`,
      ),
    };
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify(nextSession));
    } catch {
      /* In-memory tours still work. */
    }
    setSession(nextSession);
    setSample(createTourNight());
    goTo('start');
  }, [goTo, sessionKey, setSession, setSample]);

  const finish = useCallback(
    (navigate = true) => {
      try {
        sessionStorage.removeItem(sessionKey);
      } catch {
        /* No stored session to clear. */
      }
      setSession(null);
      setSample(null);
      setDestination(null);
      if (navigate) {
        const returnTo = session?.returnTo ?? '/home';
        setReturnDestination(returnTo);
        if (canChangeTourInPlace(window.location.pathname, returnTo))
          window.history.replaceState(null, '', returnTo);
        else router.replace(returnTo, { scroll: false });
      }
    },
    [router, session, sessionKey, setSession, setSample, setDestination, setReturnDestination],
  );

  useEffect(() => {
    let alive = true;
    const save = async () => {
      if (acknowledged.current || saving.current) return;
      saving.current = true;
      try {
        // A route handler saves cookies without a Server Action's page-cache invalidation.
        // That prevents preference saving from racing Next/Skip or discarding preloaded pages.
        const response = await fetch('/api/tour/seen', {
          method: 'POST',
          credentials: 'same-origin',
        });
        if (response.ok) acknowledged.current = true;
      } catch {
        // The per-user local preference remains set; retry when online or on the next entry.
      } finally {
        saving.current = false;
      }
    };
    const begin = () => {
      if (!alive || bootstrapped.current) return;
      if (
        !document.querySelector('main') ||
        document.querySelector('[role="dialog"], [role="alertdialog"]')
      )
        return;
      bootstrapped.current = true;
      setInitialized(true);
      observer.disconnect();
      let stored: TourSession | null = null;
      try {
        const raw: unknown = JSON.parse(sessionStorage.getItem(sessionKey) ?? 'null');
        if (
          typeof raw === 'object' &&
          raw !== null &&
          'returnTo' in raw &&
          typeof raw.returnTo === 'string'
        )
          stored = { returnTo: normalReturnPath(raw.returnTo) };
      } catch {
        /* Ignore invalid or unavailable browser storage. */
      }
      if (stored && stepAtLocation(window.location.pathname, window.location.search) >= 0) {
        setSession(stored);
        setSample(createTourNight());
        return;
      }
      try {
        sessionStorage.removeItem(sessionKey);
      } catch {
        /* Nothing to clear. */
      }
      if (
        window.location.pathname.startsWith('/night/tour') ||
        new URLSearchParams(window.location.search).has('tour')
      ) {
        router.replace(window.location.pathname === '/history' ? '/history' : '/home');
        bootstrapped.current = false;
        return;
      }
      let locallySeen = false;
      try {
        locallySeen = localStorage.getItem(seenKey) === 'true';
      } catch {
        /* Account preference still works. */
      }
      if (!seen && !locallySeen) {
        try {
          localStorage.setItem(seenKey, 'true');
        } catch {
          /* Persist the account preference below. */
        }
        start();
        void save();
      } else if (!seen && locallySeen) {
        void save();
      }
    };
    const observer = new MutationObserver(begin);
    observer.observe(document.body, { childList: true, subtree: true });
    queueMicrotask(begin);
    const retry = () => {
      try {
        if (localStorage.getItem(seenKey) === 'true') void save();
      } catch {
        /* Retry on the next entry. */
      }
    };
    window.addEventListener('online', retry);
    return () => {
      alive = false;
      observer.disconnect();
      window.removeEventListener('online', retry);
    };
  }, [router, seen, seenKey, sessionKey, start, pathname, search]);

  useEffect(() => {
    if (!session) return;
    if (stepIndex < 0 && destination === null) queueMicrotask(() => finish(false));
    if (destination === location) queueMicrotask(() => setDestination(null));
  }, [destination, finish, location, session, stepIndex]);

  useEffect(() => {
    if (!initialized) return;
    if (returnDestination) {
      if (location === returnDestination.split('#')[0])
        queueMicrotask(() => setReturnDestination(null));
      return;
    }
    if (
      !session &&
      destination === null &&
      (pathname.startsWith('/night/tour') || new URLSearchParams(search).has('tour'))
    ) {
      router.replace(pathname === '/history' ? '/history' : '/home');
    }
  }, [destination, initialized, location, pathname, returnDestination, router, search, session]);

  const follow =
    step?.follow && pathname === new URL(step.follow.route, 'https://tour.invalid').pathname
      ? step.follow
      : undefined;
  const waiting = destination !== null && destination !== location;
  return (
    <TourContext.Provider
      value={{ ready: initialized, active: session !== null, sample, setSample, start, goTo }}
    >
      {children}
      <InstallHint enabled={initialized && session === null && pathname === '/home'} />
      {session && (
        <CoachMark
          key={follow?.route ?? step?.route ?? 'opening'}
          step={step}
          screen={follow ?? step}
          index={stepIndex}
          waiting={waiting}
          onClose={() => finish()}
          onBack={() => {
            const previous = tourSteps[stepIndex - 1];
            if (previous) goTo(previous.id);
          }}
          onNext={() => {
            const next = tourSteps[stepIndex + 1];
            if (next) goTo(next.id);
            else finish();
          }}
          onTargetAction={goTo}
        />
      )}
    </TourContext.Provider>
  );
}
