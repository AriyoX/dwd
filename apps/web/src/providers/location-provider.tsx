'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  countryFromCoordinates,
  DEFAULT_COUNTRY_LOCATION,
  LOCATION_DISCLOSURE,
  countryProfile,
  type CountryLocation,
} from '@dwd/core';
import { updatePreplotCountryAction } from '@/features/notifications/actions';

const Context = createContext({
  location: DEFAULT_COUNTRY_LOCATION,
  permission: 'unknown',
  busy: false,
  request: () => {},
});

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
  const version = useRef(0);
  const previouslyGranted = useRef(false);
  useEffect(() => {
    let current = true;
    let grant: PermissionStatus | undefined;
    const read = async () => {
      const attempt = ++version.current;
      setBusy(true);
      setLocation(DEFAULT_COUNTRY_LOCATION);
      try {
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
        if (current) {
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
  }, []);
  function request() {
    const attempt = ++version.current;
    if (typeof navigator.geolocation === 'undefined') {
      setLocation(DEFAULT_COUNTRY_LOCATION);
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
      () => {
        if (attempt !== version.current) return;
        setLocation(DEFAULT_COUNTRY_LOCATION);
        setPermission('denied');
        setBusy(false);
        previouslyGranted.current = false;
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 },
    );
  }
  useEffect(() => {
    if (authenticated && !busy && document.visibilityState === 'visible')
      void updatePreplotCountryAction(location).catch(() => undefined);
  }, [authenticated, busy, location]);
  return (
    <Context.Provider value={{ location, permission, busy, request }}>{children}</Context.Provider>
  );
}

export const useCountryLocation = () => useContext(Context);

export function LocationNotice() {
  const { location, permission, busy, request } = useCountryLocation();
  return (
    <aside className="notice-box stack" aria-label="Location and country">
      <strong>
        {countryProfile(location.countryCode)?.name}
        {location.source === 'default' ? ' (default)' : ''}
      </strong>
      <p className="small">{LOCATION_DISCLOSURE}</p>
      {permission === 'unknown' || permission === 'prompt' ? (
        <button className="button button-secondary" type="button" disabled={busy} onClick={request}>
          {busy ? 'Finding country…' : 'Use device location'}
        </button>
      ) : null}
      {permission === 'denied' ? (
        <p className="small">Location access is off. You can enable it in your browser settings.</p>
      ) : null}
    </aside>
  );
}
