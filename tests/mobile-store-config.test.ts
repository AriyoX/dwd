import { afterEach, describe, expect, it, vi } from 'vitest';
import appConfig from '../apps/mobile/app.config';
import native from '../apps/mobile/app.json';

afterEach(() => vi.unstubAllEnvs());
describe('native store configuration', () => {
  it('declares Android notification permission, the reminder channel and keyboard resize', () => {
    expect(native.expo.android.permissions).toContain('android.permission.POST_NOTIFICATIONS');
    expect(native.expo.android.blockedPermissions).not.toContain(
      'android.permission.POST_NOTIFICATIONS',
    );
    expect(native.expo.plugins).toContainEqual([
      'expo-notifications',
      { defaultChannel: 'dwd-reminders' },
    ]);
    expect(native.expo.android.softwareKeyboardLayoutMode).toBe('resize');
  });
  it('passes the EAS Firebase file setting into the Android build', () => {
    vi.stubEnv('GOOGLE_SERVICES_JSON', '/fixture/google-services.json');
    const config = appConfig({
      config: native.expo,
      projectRoot: '/fixture',
      staticConfigPath: null,
      packageJsonPath: '/fixture/package.json',
    });
    expect(config.android?.googleServicesFile).toBe('/fixture/google-services.json');
  });
  it.each(['production', 'testing'])(
    'enforces HTTPS for %s even if an Expo command sets development NODE_ENV',
    (profile) => {
      vi.stubEnv('EAS_BUILD_PROFILE', profile);
      vi.stubEnv('NODE_ENV', 'development');
      const config = appConfig({
        config: native.expo,
        projectRoot: '/fixture',
        staticConfigPath: null,
        packageJsonPath: '/fixture/package.json',
      });
      expect(config.ios?.infoPlist?.['NSAppTransportSecurity']).toEqual({
        NSAllowsArbitraryLoads: false,
      });
    },
  );
  it('allows Metro networking only for the explicit development build', () => {
    vi.stubEnv('EAS_BUILD_PROFILE', 'development');
    const config = appConfig({
      config: native.expo,
      projectRoot: '/fixture',
      staticConfigPath: null,
      packageJsonPath: '/fixture/package.json',
    });
    expect(config.ios?.infoPlist?.['NSAppTransportSecurity']).toMatchObject({
      NSAllowsArbitraryLoads: true,
    });
  });
});
