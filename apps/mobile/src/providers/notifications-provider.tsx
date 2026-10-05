import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import {
  acknowledgeNotification,
  getMyNotificationEvents,
  registerNativePush,
  removeNativePush,
} from '@dwd/data';
import { useSupabase } from './supabase-provider';
import { actorClient } from '@/lib/actor-client';
import { withRequestTimeout } from '@/lib/request-timeout';
import {
  INSTALLATION_KEY,
  notificationRoute,
  notificationTarget,
  pushPermissionAllowed,
  pushPreferenceKey,
  pushRegistrationKey,
  pushProjectId,
} from '@/lib/native-notifications';

type PushState = 'off' | 'ready' | 'denied' | 'unavailable' | 'connecting';
type Value = {
  state: PushState;
  busy: boolean;
  issue: string | null;
  version: number;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  deactivate: () => Promise<void>;
};
const Context = createContext<Value | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { client, session, access } = useSupabase();
  const router = useRouter();
  const owner = session?.user.id;
  const [state, setState] = useState<PushState>('off');
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const current = useRef({ owner, access, session });
  useLayoutEffect(() => {
    current.current = { owner, access, session };
  }, [owner, access, session]);
  const generation = useRef(0);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const pendingTap = useRef<Notifications.NotificationResponse | null>(null);
  const seenTap = useRef<string | null>(null);
  const installation = useCallback(() => {
    let id = globalThis.localStorage.getItem(INSTALLATION_KEY);
    if (!id) {
      id = Crypto.randomUUID();
      globalThis.localStorage.setItem(INSTALLATION_KEY, id);
    }
    return id;
  }, []);

  const sync = useCallback(
    (requestPermission = false) => {
      const actor = owner;
      const token = session?.access_token;
      const epoch = generation.current;
      const valid = () =>
        current.current.owner === actor &&
        current.current.access === 'ready' &&
        generation.current === epoch;
      const work = async () => {
        if (!actor || !token || !client || !valid()) return;
        setBusy(true);
        setIssue(null);
        let disabling = false;
        try {
          if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
            setState('unavailable');
            return;
          }
          if (
            !requestPermission &&
            globalThis.localStorage.getItem(pushPreferenceKey(actor)) !== 'enabled'
          ) {
            disabling = true;
            if (globalThis.localStorage.getItem(pushRegistrationKey(actor))) {
              await withRequestTimeout((signal) =>
                removeNativePush(actorClient(client, token, signal), installation()),
              );
              globalThis.localStorage.removeItem(pushRegistrationKey(actor));
            }
            if (!valid()) return;
            setState('off');
            return;
          }
          if (Platform.OS === 'android')
            await Notifications.setNotificationChannelAsync('dwd-reminders', {
              name: 'DWD reminders',
              importance: Notifications.AndroidImportance.DEFAULT,
              lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
            });
          let permission = await Notifications.getPermissionsAsync();
          if (requestPermission && permission.canAskAgain && !pushPermissionAllowed(permission)) {
            permission = await Notifications.requestPermissionsAsync({
              ios: { allowAlert: true, allowBadge: false, allowSound: true },
            });
          }
          if (!valid()) return;
          if (!pushPermissionAllowed(permission)) {
            setState('denied');
            if (globalThis.localStorage.getItem(pushRegistrationKey(actor))) {
              await withRequestTimeout((signal) =>
                removeNativePush(actorClient(client, token, signal), installation()),
              );
              globalThis.localStorage.removeItem(pushRegistrationKey(actor));
            }
            return;
          }
          if (requestPermission)
            globalThis.localStorage.setItem(pushPreferenceKey(actor), 'enabled');
          const configured: unknown = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
          const projectId = pushProjectId(
            Constants.expoConfig?.extra,
            Constants.easConfig?.projectId,
            configured,
          );
          if (typeof projectId !== 'string' || !projectId) {
            setState('unavailable');
            setIssue('Device notifications are unavailable in this build. Your inbox still works.');
            return;
          }
          setState('connecting');
          const pushToken = await withRequestTimeout(() =>
            Notifications.getExpoPushTokenAsync({ projectId }),
          );
          if (!valid()) return;
          globalThis.localStorage.setItem(pushRegistrationKey(actor), 'registered');
          await withRequestTimeout((signal) =>
            registerNativePush(
              actorClient(client, token, signal),
              installation(),
              pushToken.data,
              Platform.OS,
            ),
          );
          if (valid()) setState('ready');
        } catch {
          if (valid()) {
            setState('unavailable');
            setIssue(
              disabling
                ? 'Could not turn off device delivery. Retry when connected, or disable DWD in Settings.'
                : 'Could not connect device notifications. Retry when connected.',
            );
          }
        } finally {
          if (valid()) setBusy(false);
        }
      };
      const result = chain.current.then(work, work);
      chain.current = result.catch(() => undefined);
      return result;
    },
    [client, owner, session?.access_token, installation],
  );

  const deactivate = useCallback(async () => {
    generation.current++;
    const actor = current.current;
    const actorSession = actor.session;
    await chain.current;
    if (
      client &&
      actorSession &&
      actor.owner &&
      globalThis.localStorage.getItem(pushRegistrationKey(actor.owner))
    ) {
      await withRequestTimeout((signal) =>
        removeNativePush(actorClient(client, actorSession.access_token, signal), installation()),
      );
      globalThis.localStorage.removeItem(pushRegistrationKey(actor.owner));
    }
    await Notifications.dismissAllNotificationsAsync().catch(() => undefined);
    setState('off');
    setBusy(false);
  }, [client, installation]);
  const disable = useCallback(async () => {
    if (!owner) return;
    setBusy(true);
    setIssue(null);
    try {
      globalThis.localStorage.setItem(pushPreferenceKey(owner), 'disabled');
      await deactivate();
    } catch {
      setState('unavailable');
      setBusy(false);
      setIssue(
        'Could not turn off device delivery. Retry turning it off when connected, or disable DWD in Settings.',
      );
    }
  }, [deactivate, owner]);

  const openTap = useCallback(async () => {
    const response = pendingTap.current;
    const actor = current.current;
    if (!response || !actor.owner || actor.access !== 'ready' || !actor.session || !client) return;
    const actorSession = actor.session;
    const data = notificationTarget(response.notification.request.content.data, actor.owner);
    pendingTap.current = null;
    Notifications.clearLastNotificationResponse();
    if (!data) return;
    try {
      const events = await withRequestTimeout((signal) =>
        getMyNotificationEvents(actorClient(client, actorSession.access_token, signal), 100),
      );
      if (current.current.owner !== actor.owner || current.current.access !== 'ready') return;
      const event = events.find((e) => e.id === data.eventId);
      router.push((event ? notificationRoute(event) : '/notifications') as Href);
      if (event && !event.acknowledgedAt) {
        void withRequestTimeout((signal) =>
          acknowledgeNotification(actorClient(client, actorSession.access_token, signal), event.id),
        )
          .then(() => {
            if (current.current.owner === actor.owner && current.current.access === 'ready')
              setVersion((v) => v + 1);
          })
          .catch(() => undefined);
      }
    } catch {
      if (current.current.owner === actor.owner && current.current.access === 'ready')
        router.push('/notifications');
    }
  }, [client, router]);

  useEffect(() => {
    generation.current++;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setState('off');
      setBusy(false);
      setIssue(null);
      if (access === 'ready') {
        void sync();
        void openTap();
      }
    });
    return () => {
      active = false;
    };
  }, [owner, access, sync, openTap]);
  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: (notification) => {
        const actor = current.current;
        const show = Boolean(
          actor.owner &&
          actor.access === 'ready' &&
          notificationTarget(notification.request.content.data, actor.owner),
        );
        return Promise.resolve({
          shouldShowBanner: show,
          shouldShowList: show,
          shouldPlaySound: false,
          shouldSetBadge: false,
        });
      },
    });
    function tap(response: Notifications.NotificationResponse | null) {
      if (!response) return;
      const key = response.notification.request.identifier;
      if (seenTap.current === key) return;
      seenTap.current = key;
      pendingTap.current = response;
      void openTap();
    }
    tap(Notifications.getLastNotificationResponse());
    const taps = Notifications.addNotificationResponseReceivedListener(tap);
    const received = Notifications.addNotificationReceivedListener(() => setVersion((v) => v + 1));
    const tokens = Notifications.addPushTokenListener(() => void sync());
    const foreground = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void sync();
        setVersion((v) => v + 1);
      }
    });
    return () => {
      taps.remove();
      received.remove();
      tokens.remove();
      foreground.remove();
    };
  }, [sync, openTap]);
  const value = useMemo(
    () => ({ state, busy, issue, version, enable: () => sync(true), disable, deactivate }),
    [state, busy, issue, version, sync, disable, deactivate],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useNotifications() {
  const value = useContext(Context);
  if (!value) throw new Error('NotificationsProvider required.');
  return value;
}
