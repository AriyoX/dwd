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
  servicesEnabled: boolean;
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
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [servicesEnabled, setServicesEnabled] = useState(true);
  const prompting = useRef(false);
  const [initialized, setInitialized] = useState(false);
  const allowed = useRef(false);
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
    try {
      prompting.current = prompt;
      let grant = await Location.getForegroundPermissionsAsync();
      if (prompt && !grant.granted && grant.canAskAgain)
        grant = await Location.requestForegroundPermissionsAsync();
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
      const services = await Location.hasServicesEnabledAsync();
      if (attempt !== version.current) return;
      setServicesEnabled(services);
      if (!services) return;
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
      prompting.current = false;
      if (attempt === version.current) setBusy(false);
    }
  }
  useEffect(() => {
    try {
      allowed.current = localStorage.getItem(preferenceKey) === 'true';
      setEnabled(allowed.current);
    } catch {
      /* Storage may be unavailable. */
    }
    setInitialized(true);
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (prompting.current) return;
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
    if (!initialized || !client || !token || !ready || busy || AppState.currentState !== 'active')
      return;
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
  }, [initialized, client, token, ready, busy, location]);
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
      value={{
        location,
        permission,
        busy,
        enabled,
        servicesEnabled,
        disable,
        request: () => refresh(true),
      }}
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
