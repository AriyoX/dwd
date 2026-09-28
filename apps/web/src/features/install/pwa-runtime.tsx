'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  activeInstallDismissal,
  detectPlatform,
  isInstalledPwa,
  notificationPermissionState,
  resolveInstallationState,
} from './pwa-detection';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallationState = 'installed' | 'installable' | 'manual' | 'unavailable';
export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';
export interface PwaRuntimeState {
  ready: boolean;
  installation: InstallationState;
  installed: boolean;
  platform: 'ios' | 'android' | 'desktop' | 'other';
  serviceWorkerReady: boolean;
  notificationsSupported: boolean;
  pushSupported: boolean;
  permission: NotificationPermissionState;
  installDismissed: boolean;
  manualInstructions: string[];
  install(): Promise<'accepted' | 'dismissed' | 'manual' | 'unavailable'>;
  dismissInstall(): void;
  requestPermission(): Promise<NotificationPermissionState>;
  sendTest(): Promise<boolean>;
}

const PwaRuntimeContext = createContext<PwaRuntimeState | null>(null);
const DISMISSAL_KEY = 'dwd:install-dismissed-at:v2';

export function PwaRuntimeProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [serviceWorkerReady, setServiceWorkerReady] = useState(false);
  const [permission, setPermission] = useState<NotificationPermissionState>('unsupported');
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [platform, setPlatform] = useState<PwaRuntimeState['platform']>('other');

  useEffect(() => {
    let active = true;
    const standalone = window.matchMedia('(display-mode: standalone)');
    const detectInstalled = () => {
      const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
      setInstalled(isInstalledPwa(standalone.matches, iosStandalone));
    };
    const ua = navigator.userAgent;
    queueMicrotask(() => {
      if (!active) return;
      setPlatform(detectPlatform(ua, navigator.maxTouchPoints));
      detectInstalled();
      setPermission(
        notificationPermissionState(
          'Notification' in window,
          'Notification' in window ? window.Notification.permission : undefined,
        ),
      );
      try {
        const stored = Number(localStorage.getItem(DISMISSAL_KEY));
        setDismissedAt(activeInstallDismissal(stored, Date.now()));
      } catch {
        setDismissedAt(null);
      }
      setReady(true);
    });
    const capture = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const appInstalled = () => {
      setPrompt(null);
      detectInstalled();
    };
    const refreshRuntime = () => {
      if (document.visibilityState === 'hidden') return;
      detectInstalled();
      setPermission(
        notificationPermissionState(
          'Notification' in window,
          'Notification' in window ? window.Notification.permission : undefined,
        ),
      );
    };
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', appInstalled);
    window.addEventListener('focus', refreshRuntime);
    document.addEventListener('visibilitychange', refreshRuntime);
    standalone.addEventListener('change', detectInstalled);
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then(() => navigator.serviceWorker.ready)
        .then(() => setServiceWorkerReady(true))
        .catch(() => setServiceWorkerReady(false));
    }
    return () => {
      active = false;
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('appinstalled', appInstalled);
      window.removeEventListener('focus', refreshRuntime);
      document.removeEventListener('visibilitychange', refreshRuntime);
      standalone.removeEventListener('change', detectInstalled);
    };
  }, []);

  const notificationsSupported = permission !== 'unsupported';
  const pushSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    notificationsSupported;
  const installation: InstallationState = resolveInstallationState(
    installed,
    prompt !== null,
    platform,
  );
  const installDismissed = dismissedAt !== null;
  const manualInstructions = useMemo(
    () =>
      platform === 'ios'
        ? [
            'Tap the Share button.',
            'Choose Add to Home Screen.',
            'Open dwd from your Home Screen.',
            'Return to notification settings.',
          ]
        : platform === 'android'
          ? [
              'Open your browser menu.',
              'Choose Install app or Add to Home screen.',
              'Open dwd from the new icon.',
            ]
          : [
              'Use the install icon in the address bar or your browser menu.',
              'Open dwd from the installed app icon.',
            ],
    [platform],
  );

  const install = useCallback(async () => {
    if (installed) return 'accepted' as const;
    if (!prompt) return installation === 'manual' ? ('manual' as const) : ('unavailable' as const);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setPrompt(null);
      return choice.outcome;
    } catch {
      return 'unavailable' as const;
    }
  }, [installation, installed, prompt]);

  const dismissInstall = useCallback(() => {
    const now = Date.now();
    setDismissedAt(now);
    try {
      localStorage.setItem(DISMISSAL_KEY, String(now));
    } catch {
      // The in-memory cooldown still prevents repeated interruption this visit.
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<NotificationPermissionState> => {
    if (!('Notification' in window)) return 'unsupported';
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    } catch {
      const current = Notification.permission;
      setPermission(current);
      return current;
    }
  }, []);

  const sendTest = useCallback(async () => {
    if (permission !== 'granted') return false;
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      if (!registration?.active) return false;
      await registration.showNotification('dwd reminders are ready', {
        body: 'Your test notification worked.',
        tag: 'dwd-test',
        data: { url: '/account#notifications' },
      });
      return true;
    } catch {
      return false;
    }
  }, [permission]);

  const value = useMemo<PwaRuntimeState>(
    () => ({
      ready,
      installation,
      installed,
      platform,
      serviceWorkerReady,
      notificationsSupported,
      pushSupported,
      permission,
      installDismissed,
      manualInstructions,
      install,
      dismissInstall,
      requestPermission,
      sendTest,
    }),
    [
      ready,
      installation,
      installed,
      platform,
      serviceWorkerReady,
      notificationsSupported,
      pushSupported,
      permission,
      installDismissed,
      manualInstructions,
      install,
      dismissInstall,
      requestPermission,
      sendTest,
    ],
  );
  return <PwaRuntimeContext.Provider value={value}>{children}</PwaRuntimeContext.Provider>;
}

export function usePwaRuntime(): PwaRuntimeState {
  const context = useContext(PwaRuntimeContext);
  if (!context) throw new Error('PwaRuntimeProvider is missing.');
  return context;
}
