import type { InstallationState, PwaRuntimeState } from './pwa-runtime';

export const INSTALL_DISMISSAL_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

export function detectPlatform(
  userAgent: string,
  maxTouchPoints: number,
): PwaRuntimeState['platform'] {
  const ios =
    /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  if (ios) return 'ios';
  if (/Android/.test(userAgent)) return 'android';
  if (/Windows|Macintosh|Linux/.test(userAgent)) return 'desktop';
  return 'other';
}

export function isInstalledPwa(
  displayModeStandalone: boolean,
  navigatorStandalone = false,
): boolean {
  return displayModeStandalone || navigatorStandalone;
}

export function notificationPermissionState(
  supported: boolean,
  permission: NotificationPermission | undefined,
): 'granted' | 'denied' | 'default' | 'unsupported' {
  return supported && permission ? permission : 'unsupported';
}

export function resolveInstallationState(
  installed: boolean,
  hasInstallPrompt: boolean,
  platform: PwaRuntimeState['platform'],
): InstallationState {
  if (installed) return 'installed';
  if (hasInstallPrompt) return 'installable';
  return platform === 'ios' || platform === 'android' || platform === 'desktop'
    ? 'manual'
    : 'unavailable';
}

export function activeInstallDismissal(storedAt: number, now: number): number | null {
  return Number.isFinite(storedAt) &&
    storedAt > 0 &&
    now >= storedAt &&
    now - storedAt < INSTALL_DISMISSAL_COOLDOWN_MS
    ? storedAt
    : null;
}
