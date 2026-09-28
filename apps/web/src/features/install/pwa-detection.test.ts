import { describe, expect, it } from 'vitest';
import {
  INSTALL_DISMISSAL_COOLDOWN_MS,
  activeInstallDismissal,
  detectPlatform,
  isInstalledPwa,
  notificationPermissionState,
  resolveInstallationState,
} from './pwa-detection';

describe('PWA runtime detection', () => {
  it('uses display-mode and the iOS standalone signal for installed state', () => {
    expect(isInstalledPwa(true, false)).toBe(true);
    expect(isInstalledPwa(false, true)).toBe(true);
    expect(isInstalledPwa(false, false)).toBe(false);
  });

  it('distinguishes native install prompts, manual installation, and unavailable platforms', () => {
    expect(resolveInstallationState(false, true, 'android')).toBe('installable');
    expect(resolveInstallationState(false, false, 'ios')).toBe('manual');
    expect(resolveInstallationState(true, false, 'desktop')).toBe('installed');
    expect(resolveInstallationState(false, false, 'other')).toBe('unavailable');
  });

  it('recognizes touch-capable iPads reporting a desktop user agent', () => {
    expect(detectPlatform('Mozilla/5.0 (Macintosh) Version/18 Safari/605.1', 5)).toBe('ios');
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0)', 0)).toBe('desktop');
  });

  it('honors and expires a dismissed install prompt cooldown', () => {
    const now = 1_800_000_000_000;
    expect(activeInstallDismissal(now - 1_000, now)).toBe(now - 1_000);
    expect(activeInstallDismissal(now - INSTALL_DISMISSAL_COOLDOWN_MS, now)).toBeNull();
    expect(activeInstallDismissal(now + 1_000, now)).toBeNull();
  });

  it('represents every notification permission state including unsupported browsers', () => {
    expect(notificationPermissionState(true, 'granted')).toBe('granted');
    expect(notificationPermissionState(true, 'denied')).toBe('denied');
    expect(notificationPermissionState(true, 'default')).toBe('default');
    expect(notificationPermissionState(false, undefined)).toBe('unsupported');
  });
});
