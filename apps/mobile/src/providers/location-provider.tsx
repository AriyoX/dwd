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
  request: () => Promise<void>;
}
const Context = createContext<LocationValue | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState(DEFAULT_COUNTRY_LOCATION);
  const [permission, setPermission] = useState<LocationValue['permission']>('unknown');
  const [busy, setBusy] = useState(true);
  const version = useRef(0);
  const { client, session, access } = useSupabase();
  const token = session?.access_token;
  const ready = access === 'ready';
  async function refresh(prompt = false) {
    const attempt = ++version.current;
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Read external permission before saving the default country.
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
  return (
    <Context.Provider value={{ location, permission, busy, request: () => refresh(true) }}>
      {children}
    </Context.Provider>
  );
}

export function useCountryLocation() {
  const value = useContext(Context);
  if (!value) throw new Error('LocationProvider is missing.');
  return value;
}
