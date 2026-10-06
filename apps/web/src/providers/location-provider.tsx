'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import {
  countryFromCoordinates,
  DEFAULT_COUNTRY_LOCATION,
  LOCATION_DISCLOSURE,
  type CountryLocation,
} from '@dwd/core';
import { updatePreplotCountryAction } from '@/features/notifications/actions';

const Context = createContext({
  location: DEFAULT_COUNTRY_LOCATION,
  permission: 'unknown',
  busy: false,
  request: () => {},
  enabled: true,
  dismissed: true,
  disable: () => {},
  dismiss: () => {},
});

const preferenceKey = 'dwd.location.enabled';
const dismissedKey = 'dwd.location.dismissed';
function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Private browsing may block storage. */
  }
}

export function LocationProvider({
  children,
  authenticated = false,
}: {
  children: ReactNode;
  authenticated?: boolean;
}) {
  const [location, setLocation] = useState<CountryLocation>(DEFAULT_COUNTRY_LOCATION);
  const [permission, setPermission] = useState('unknown');
  const [busy, setBusy] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [dismissed, setDismissed] = useState(true);
  const allowed = useRef(true);
  const version = useRef(0);
  const previouslyGranted = useRef(false);
  const dismiss = useCallback(() => {
    setDismissed(true);
    remember(dismissedKey, 'true');
  }, []);
  const request = useCallback(() => {
    allowed.current = true;
    setEnabled(true);
    remember(preferenceKey, 'true');
    dismiss();
    const attempt = ++version.current;
    if (typeof navigator.geolocation === 'undefined') {
      setLocation(DEFAULT_COUNTRY_LOCATION);
      setPermission('unavailable');
      setBusy(false);
      return;
    }
    setBusy(true);
    setLocation(DEFAULT_COUNTRY_LOCATION);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (attempt !== version.current) return;
        setLocation(countryFromCoordinates(position.coords.latitude, position.coords.longitude));
        previouslyGranted.current = true;
        setPermission('granted');
        setBusy(false);
      },
      (error) => {
        if (attempt !== version.current) return;
        setLocation(DEFAULT_COUNTRY_LOCATION);
        setPermission(error.code === 1 ? 'denied' : 'unavailable');
        setBusy(false);
        previouslyGranted.current = false;
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 },
    );
  }, [dismiss]);
  useEffect(() => {
    try {
      allowed.current = localStorage.getItem(preferenceKey) !== 'false';
      setEnabled(allowed.current);
      setDismissed(localStorage.getItem(dismissedKey) === 'true');
    } catch {
      setDismissed(false);
    }
    let current = true;
    let grant: PermissionStatus | undefined;
    const read = async () => {
      const attempt = ++version.current;
      if (!allowed.current) {
        setLocation(DEFAULT_COUNTRY_LOCATION);
        setBusy(false);
        return;
      }
      setBusy(true);
      setLocation(DEFAULT_COUNTRY_LOCATION);
      try {
        if (grant) grant.onchange = null;
        grant = await navigator.permissions.query({ name: 'geolocation' });
        if (!current || attempt !== version.current) return;
        setPermission(grant.state);
        if (grant.state === 'granted') request();
        else {
          setLocation(DEFAULT_COUNTRY_LOCATION);
          setBusy(false);
        }
        grant.onchange = () => void read();
      } catch {
        if (current && attempt === version.current) {
          if (previouslyGranted.current) request();
          else {
            setLocation(DEFAULT_COUNTRY_LOCATION);
            setBusy(false);
          }
        }
      }
    };
    void read();
    const foreground = () => {
      if (document.visibilityState === 'visible') void read();
      else {
        version.current++;
        setBusy(false);
      }
    };
    document.addEventListener('visibilitychange', foreground);
    return () => {
      current = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- Invalidate stale fixes, not a DOM ref.
      version.current++;
      if (grant) grant.onchange = null;
      document.removeEventListener('visibilitychange', foreground);
    };
  }, [request]);
  function disable() {
    allowed.current = false;
    version.current++;
    setEnabled(false);
    setBusy(false);
    setLocation(DEFAULT_COUNTRY_LOCATION);
    previouslyGranted.current = false;
    remember(preferenceKey, 'false');
    dismiss();
  }
  useEffect(() => {
    if (authenticated && !busy && document.visibilityState === 'visible')
      void updatePreplotCountryAction(location).catch(() => undefined);
  }, [authenticated, busy, location]);
  return (
    <Context.Provider
      value={{ location, permission, busy, request, enabled, dismissed, disable, dismiss }}
    >
      {children}
    </Context.Provider>
  );
}

export const useCountryLocation = () => useContext(Context);

export function LocationNotice() {
  const { permission, busy, request, enabled, dismissed, dismiss } = useCountryLocation();
  const pathname = usePathname();
  if (
    pathname !== '/home' ||
    busy ||
    dismissed ||
    !enabled ||
    !['unknown', 'prompt'].includes(permission)
  )
    return null;
  return (
    <aside className="notice-box location-prompt" aria-label="Location">
      <p className="small">{LOCATION_DISCLOSURE}</p>
      <div className="row">
        <button className="button button-secondary" type="button" disabled={busy} onClick={request}>
          Use location
        </button>
        <button className="button button-quiet" type="button" onClick={dismiss}>
          Not now
        </button>
      </div>
    </aside>
  );
}
