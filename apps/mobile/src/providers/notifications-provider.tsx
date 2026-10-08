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
import type { NotificationResponse } from 'expo-notifications';
import Constants from 'expo-constants';
import { loadNotificationSdk } from '@/lib/notification-sdk';
import * as Crypto from 'expo-crypto';
import {
  acknowledgeNotification,
  getMyNotificationEvent,
  recordPreplotOpen,
  registerNativePush,
  removeNativePush,
} from '@dwd/data';
import { useSupabase } from './supabase-provider';
import { actorClient } from '@/lib/actor-client';
import { withRequestTimeout } from '@/lib/request-timeout';
import { useConnectivity } from './connectivity-provider';
import { isConnectionFailure } from '@/lib/offline-cache';
import {
  INSTALLATION_KEY,
  notificationRoute,
  notificationTarget,
  pushPermissionAllowed,
  pushPreferenceKey,
  pushRegistrationKey,
  pushProjectId,
} from '@/lib/native-notifications';

type PushState = 'off' | 'ready' | 'denied' | 'unavailable' | 'connecting' | 'pending';
type Value = {
  state: PushState;
  busy: boolean;
  issue: string | null;
  canAskAgain: boolean;
  enabled: boolean;
  version: number;
  enable: () => Promise<void>;
  retry: () => Promise<void>;
  disable: () => Promise<void>;
  deactivate: () => Promise<void>;
};
const Context = createContext<Value | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { client, session, access } = useSupabase();
  const { online } = useConnectivity();
  const connection = useRef(online);
  useLayoutEffect(() => {
    connection.current = online;
  }, [online]);
  const router = useRouter();
  const owner = session?.user.id;
  const [state, setState] = useState<PushState>('off');
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [version, setVersion] = useState(0);
  const current = useRef({ owner, access, session });
  useLayoutEffect(() => {
    current.current = { owner, access, session };
  }, [owner, access, session]);
  const generation = useRef(0);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const queued = useRef<{
    actor: string | undefined;
    requestPermission: boolean;
    epoch: number;
    result: Promise<void>;
  } | null>(null);
  const pendingTap = useRef<NotificationResponse | null>(null);
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
      const previous = queued.current;
      if (
        previous &&
        previous.actor === actor &&
        previous.epoch === epoch &&
        (!requestPermission || previous.requestPermission)
      )
        return previous.result;
      const valid = () =>
        current.current.owner === actor &&
        current.current.access === 'ready' &&
        generation.current === epoch;
      const work = async () => {
        if (!actor || !token || !client || !valid()) return;
        setBusy(true);
        setIssue(null);
        let disabling = false;
        let permissionDenied = false;
        try {
          if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
            setState('unavailable');
            setIssue('Notifications are available in the DWD app.');
            return;
          }
          const Notifications = await loadNotificationSdk();
          if (!valid()) return;
          if (!Notifications) {
            setState('unavailable');
            setIssue('Use the installed DWD app to turn on notifications.');
            return;
          }
          // Keep the explicit opt-in even if the OS denies permission. Returning
          // from Settings can then finish registration without another prompt.
          if (requestPermission)
            globalThis.localStorage.setItem(pushPreferenceKey(actor), 'enabled');
          setEnabled(globalThis.localStorage.getItem(pushPreferenceKey(actor)) === 'enabled');
          if (
            !requestPermission &&
            globalThis.localStorage.getItem(pushPreferenceKey(actor)) !== 'enabled'
          ) {
            disabling = true;
            if (globalThis.localStorage.getItem(pushRegistrationKey(actor))) {
              if (connection.current === false) {
                setState('pending');
                setIssue("You're offline. We'll turn off notifications when you're back online.");
                return;
              }
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
          setCanAskAgain(permission.canAskAgain);
          if (!pushPermissionAllowed(permission)) {
            permissionDenied = true;
            setState('denied');
            if (globalThis.localStorage.getItem(pushRegistrationKey(actor))) {
              await withRequestTimeout((signal) =>
                removeNativePush(actorClient(client, token, signal), installation()),
              );
              globalThis.localStorage.removeItem(pushRegistrationKey(actor));
            }
            return;
          }
          const configured: unknown = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
          const projectId = pushProjectId(
            Constants.expoConfig?.extra,
            Constants.easConfig?.projectId,
            configured,
          );
          if (typeof projectId !== 'string' || !projectId) {
            setState('unavailable');
            setIssue(
              'Notifications are unavailable in this version. You can still use your inbox.',
            );
            return;
          }
          if (connection.current === false) {
            setState('pending');
            setIssue("You're offline. We'll turn on notifications when you're back online.");
            return;
          }
          setState('connecting');
          const pushToken = await withRequestTimeout(() =>
            Notifications.getExpoPushTokenAsync({ projectId }),
          );
          if (!valid()) return;
          // Remember an attempted registration too: a lost response still needs
          // cleanup on opt-out. Only a successful RPC is marked registered.
          globalThis.localStorage.setItem(pushRegistrationKey(actor), 'pending');
          await withRequestTimeout((signal) =>
            registerNativePush(
              actorClient(client, token, signal),
              installation(),
              pushToken.data,
              Platform.OS,
            ),
          );
          if (valid()) {
            globalThis.localStorage.setItem(pushRegistrationKey(actor), 'registered');
            setState('ready');
          }
        } catch (error) {
          if (valid()) {
            const message =
              error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
            const setupFailure =
              /firebase|google.services|default.*app|project.?id|credentials|not supported|physical device|development build|expo go/i.test(
                message,
              );
            const offline = connection.current === false || isConnectionFailure(error);
            setState(permissionDenied ? 'denied' : setupFailure ? 'unavailable' : 'pending');
            setIssue(
              permissionDenied
                ? 'Notifications are off in your phone’s settings.'
                : disabling
                  ? "Couldn't turn off notifications. Try again when you're online."
                  : setupFailure
                    ? 'Notifications are unavailable in this version. You can still use your inbox.'
                    : offline
                      ? "You're offline. We'll turn on notifications when you're back online."
                      : "Couldn't turn on notifications. Try again.",
            );
            if (setupFailure)
              console.warn(
                'DWD notifications: native push configuration is missing or unsupported.',
              );
          }
        } finally {
          if (valid()) setBusy(false);
        }
      };
      const result = chain.current.then(work, work);
      queued.current = { actor, requestPermission, epoch, result };
      chain.current = result.catch(() => undefined);
      void result
        .finally(() => {
          if (queued.current?.result === result) queued.current = null;
        })
        .catch(() => undefined);
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
    const Notifications = await loadNotificationSdk();
    await Notifications?.dismissAllNotificationsAsync().catch(() => undefined);
    setState('off');
    setBusy(false);
  }, [client, installation]);
  const disable = useCallback(async () => {
    if (!owner) return;
    setBusy(true);
    setIssue(null);
    try {
      globalThis.localStorage.setItem(pushPreferenceKey(owner), 'disabled');
      setEnabled(false);
      await deactivate();
    } catch {
      setState('pending');
      setBusy(false);
      setIssue("Couldn't turn off notifications. Try again when you're online.");
    }
  }, [deactivate, owner]);

  const openTap = useCallback(async () => {
    const response = pendingTap.current;
    const actor = current.current;
    if (!response || !actor.owner || actor.access !== 'ready' || !actor.session || !client) return;
    const actorSession = actor.session;
    const data = notificationTarget(response.notification.request.content.data, actor.owner);
    pendingTap.current = null;
    try {
      const Notifications = await loadNotificationSdk();
      Notifications?.clearLastNotificationResponse();
      if (!data) return;
      const event = await withRequestTimeout((signal) =>
        getMyNotificationEvent(
          actorClient(client, actorSession.access_token, signal),
          data.eventId,
        ),
      );
      if (current.current.owner !== actor.owner || current.current.access !== 'ready') return;
      router.push((event ? notificationRoute(event) : '/notifications') as Href);
      if (event?.eventType === 'preplot') {
        void withRequestTimeout((signal) =>
          recordPreplotOpen(actorClient(client, actorSession.access_token, signal), event.id),
        ).catch(() => undefined);
      }
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
      setEnabled(false);
      setCanAskAgain(true);
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
    if (online === true && access === 'ready') void sync();
  }, [online, access, sync]);
  useEffect(() => {
    if (state !== 'pending' || online === false) return;
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void sync();
    }, 15_000);
    return () => clearInterval(timer);
  }, [state, online, sync]);
  useEffect(() => {
    let active = true;
    let cleanup: (() => void) | undefined;
    async function listen() {
      const Notifications = await loadNotificationSdk();
      if (!active || !Notifications) return;
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
      function tap(response: NotificationResponse | null) {
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
      cleanup = () => {
        taps.remove();
        received.remove();
        tokens.remove();
        foreground.remove();
      };
    }
    void listen().catch(() => {
      if (!active) return;
      setState('unavailable');
      setIssue('Notifications are unavailable in this version. You can still use your inbox.');
    });
    return () => {
      active = false;
      cleanup?.();
    };
  }, [sync, openTap]);
  const value = useMemo(
    () => ({
      state,
      busy,
      issue,
      canAskAgain,
      enabled,
      version,
      enable: () => sync(true),
      retry: () => sync(),
      disable,
      deactivate,
    }),
    [state, busy, issue, canAskAgain, enabled, version, sync, disable, deactivate],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useNotifications() {
  const value = useContext(Context);
  if (!value) throw new Error('NotificationsProvider required.');
  return value;
}
