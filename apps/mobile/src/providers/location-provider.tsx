import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { countryFromCoordinates, DEFAULT_COUNTRY_LOCATION, type CountryLocation } from '@dwd/core';
import { updatePreplotCountry } from '@dwd/data';
import { actorClient } from '@/lib/actor-client';
import { withRequestTimeout } from '@/lib/request-timeout';
import { useSupabase } from './supabase-provider';

interface LocationValue {
  location: CountryLocation;
  permission: 'unknown' | 'granted' | 'denied';
  busy: boolean;
  enabled: boolean;
  disable: () => void;
  request: () => Promise<void>;
}
const Context = createContext<LocationValue | null>(null);
const preferenceKey = 'dwd.location.enabled';
function remember(enabled: boolean) {
  try {
    localStorage.setItem(preferenceKey, String(enabled));
  } catch {
    /* Keep the in-memory choice. */
  }
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState(DEFAULT_COUNTRY_LOCATION);
  const [permission, setPermission] = useState<LocationValue['permission']>('unknown');
  const [busy, setBusy] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const allowed = useRef(true);
  const version = useRef(0);
  const { client, session, access } = useSupabase();
  const token = session?.access_token;
  const ready = access === 'ready';
  async function refresh(prompt = false) {
    const attempt = ++version.current;
    if (prompt) {
      allowed.current = true;
      setEnabled(true);
      remember(true);
    }
    if (!allowed.current) {
      setLocation(DEFAULT_COUNTRY_LOCATION);
      setBusy(false);
      return;
    }
    setBusy(true);
    setLocation(DEFAULT_COUNTRY_LOCATION);
    try {
      const grant = prompt
        ? await Location.requestForegroundPermissionsAsync()
        : await Location.getForegroundPermissionsAsync();
      if (attempt !== version.current) return;
      setPermission(
        grant.granted
          ? 'granted'
          : grant.status === Location.PermissionStatus.UNDETERMINED
            ? 'unknown'
            : 'denied',
      );
      if (!grant.granted) {
        setLocation(DEFAULT_COUNTRY_LOCATION);
        return;
      }
      const position = await withRequestTimeout(() =>
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Lowest,
          mayShowUserSettingsDialog: false,
        }),
      );
      if (attempt === version.current)
        setLocation(countryFromCoordinates(position.coords.latitude, position.coords.longitude));
    } catch {
      if (attempt === version.current) setLocation(DEFAULT_COUNTRY_LOCATION);
    } finally {
      if (attempt === version.current) setBusy(false);
    }
  }
  useEffect(() => {
    try {
      allowed.current = localStorage.getItem(preferenceKey) !== 'false';
      setEnabled(allowed.current);
    } catch {
      /* Storage may be unavailable. */
    }
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
      else {
        version.current++;
        setBusy(false);
      }
    });
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- This counter invalidates async work; it is not a DOM ref.
      version.current++;
      subscription.remove();
    };
  }, []);
  useEffect(() => {
    if (!client || !token || !ready || busy || AppState.currentState !== 'active') return;
    let current = true;
    const save = () => {
      if (current)
        void withRequestTimeout(() =>
          updatePreplotCountry(
            actorClient(client, token),
            location.countryCode,
            location.calendarRegion,
          ),
        ).catch(() => undefined);
    };
    save();
    return () => {
      current = false;
    };
  }, [client, token, ready, busy, location]);
  function disable() {
    allowed.current = false;
    version.current++;
    setEnabled(false);
    setBusy(false);
    setLocation(DEFAULT_COUNTRY_LOCATION);
    remember(false);
  }
  return (
    <Context.Provider
      value={{ location, permission, busy, enabled, disable, request: () => refresh(true) }}
    >
      {children}
    </Context.Provider>
  );
}

export function useCountryLocation() {
  const value = useContext(Context);
  if (!value) throw new Error('LocationProvider is missing.');
  return value;
}
