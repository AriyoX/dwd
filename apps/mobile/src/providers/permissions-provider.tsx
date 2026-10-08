import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import { loadNotificationSdk } from '@/lib/notification-sdk';
import { pushPermissionAllowed, pushPreferenceKey } from '@/lib/native-notifications';
import { requestInitialPermission } from '@/lib/initial-permissions';
import { useCountryLocation } from './location-provider';
import { useNotifications } from './notifications-provider';
import { useSupabase } from './supabase-provider';
import { PermissionContext } from './permission-context';

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const location = useCountryLocation();
  const push = useNotifications();
  const { session, access } = useSupabase();
  const [ready, setReady] = useState(false);
  const [notificationsOff, setNotificationsOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const current = useRef({ location, push, session, access });
  useLayoutEffect(() => {
    current.current = { location, push, session, access };
  });
  const running = useRef<Promise<void> | null>(null);
  const alive = useRef(true);
  const check = useCallback((initial: boolean, explicit = false) => {
    if (running.current) return running.current;
    const isAlive = () => alive.current;
    const work = async () => {
      if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
        setReady(true);
        return;
      }
      setBusy(true);
      setIssue(null);
      let registerPushFor: string | undefined;
      try {
        try {
          const sdk = await loadNotificationSdk();
          if (sdk) {
            if (Platform.OS === 'android')
              await sdk.setNotificationChannelAsync('dwd-reminders', {
                name: 'DWD reminders',
                importance: sdk.AndroidImportance.DEFAULT,
                lockscreenVisibility: sdk.AndroidNotificationVisibility.PRIVATE,
              });
            const request = () =>
              sdk.requestPermissionsAsync({
                ios: { allowAlert: true, allowBadge: false, allowSound: true },
              });
            let grant = initial
              ? await requestInitialPermission(
                  localStorage,
                  'notifications',
                  () => sdk.getPermissionsAsync(),
                  request,
                )
              : await sdk.getPermissionsAsync();
            if (!isAlive()) return;
            if (explicit && !pushPermissionAllowed(grant)) {
              if (!grant.canAskAgain) {
                await Linking.openSettings();
                return;
              }
              grant = await request();
            }
            if (!isAlive()) return;
            setNotificationsOff(!pushPermissionAllowed(grant));
            const actor = current.current;
            if (
              pushPermissionAllowed(grant) &&
              actor.session &&
              actor.access === 'ready' &&
              (explicit || localStorage.getItem(pushPreferenceKey(actor.session.user.id)) === null)
            ) {
              registerPushFor = actor.session.user.id;
            }
          }
        } catch {
          if (isAlive()) setIssue('Could not check notifications. Try again.');
        }
        if (!isAlive()) return;
        try {
          // Prompts are sequential so iOS never has two permission sheets competing.
          const grant = initial
            ? await requestInitialPermission(
                localStorage,
                'location',
                Location.getForegroundPermissionsAsync,
                Location.requestForegroundPermissionsAsync,
              )
            : await Location.getForegroundPermissionsAsync();
          if (!isAlive()) return;
          if (explicit && !grant.granted && !grant.canAskAgain) {
            await Linking.openSettings();
            return;
          }
          if (explicit && grant.granted && !(await Location.hasServicesEnabledAsync())) {
            await Linking.openSettings();
            return;
          }
          if (
            (initial && grant.granted && localStorage.getItem('dwd.location.enabled') === null) ||
            explicit
          ) {
            await current.current.location.request();
          }
        } catch {
          if (isAlive()) setIssue('Could not check location. Try again.');
        }
      } finally {
        // Token registration can need the network; it must not delay either OS prompt.
        if (
          isAlive() &&
          registerPushFor &&
          current.current.session?.user.id === registerPushFor &&
          current.current.access === 'ready'
        ) {
          try {
            if (explicit || localStorage.getItem(pushPreferenceKey(registerPushFor)) === null)
              await current.current.push.enable();
          } catch {
            if (isAlive()) setIssue('Could not turn on notifications. Try again.');
          }
        }
        if (alive.current) {
          setReady(true);
          setBusy(false);
        }
      }
    };
    const promise = work().finally(() => {
      running.current = null;
    });
    running.current = promise;
    return promise;
  }, []);
  useEffect(() => {
    alive.current = true;
    void check(true);
    let backgrounded = AppState.currentState === 'background';
    const listener = AppState.addEventListener('change', (next) => {
      if (next === 'background') backgrounded = true;
      const returned = next === 'active' && backgrounded;
      if (returned) {
        backgrounded = false;
        setDismissed(false);
        void check(false);
      }
    });
    return () => {
      alive.current = false;
      listener.remove();
    };
  }, [check]);
  const owner = session?.user.id;
  useEffect(() => {
    if (ready && access === 'ready') void check(false);
  }, [ready, owner, access, check]);
  return (
    <PermissionContext.Provider
      value={{
        ready,
        notificationsOff:
          notificationsOff ||
          (access === 'ready' && (push.state === 'off' || push.state === 'denied')),
        locationOff:
          !location.enabled || location.permission !== 'granted' || !location.servicesEnabled,
        busy: busy || push.busy || location.busy,
        dismissed,
        issue,
        enable: () => check(false, true),
        dismiss: () => setDismissed(true),
      }}
    >
      {children}
    </PermissionContext.Provider>
  );
}
