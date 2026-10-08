/* eslint-disable @typescript-eslint/no-deprecated -- Check actual screen targets without a device. */
import { createElement, type ComponentType } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TonightScreen from '../../app/(tabs)/index';
import HistoryScreen from '../../app/(tabs)/history';
import AccountScreen from '../../app/(tabs)/account';
import NotificationsScreen from '../../app/notifications';

const runtime = vi.hoisted(() => ({ data: null as unknown, loading: false }));
vi.mock('react-native', () => ({
  Text: 'Text',
  View: 'View',
  RefreshControl: 'RefreshControl',
  ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: <T,>(value: T) => value },
}));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('@/components/tour-screen', () => ({ TourScreen: 'TourScreen', TourTarget: 'TourTarget' }));
vi.mock('@/components/screen', () => ({
  Panel: 'Panel',
  ScreenHeading: 'Heading',
  LoadingPanel: 'LoadingPanel',
  Notice: 'Notice',
  RetryPanel: 'RetryPanel',
}));
vi.mock('@/components/primary-button', () => ({ PrimaryButton: 'Button', Action: 'Action' }));
vi.mock('@/components/navigation-row', () => ({ NavigationRow: 'NavigationRow' }));
vi.mock('@/components/brand', () => ({ Brand: 'Brand' }));
vi.mock('@/components/night-artwork', () => ({ NightArtwork: 'NightArtwork' }));
vi.mock('@/components/tonight-banners', () => ({ TonightBanners: 'TonightBanners' }));
vi.mock('@/components/night-activity', () => ({ NightActivity: 'NightActivity' }));
vi.mock('@/components/appearance-picker', () => ({ AppearancePicker: 'AppearancePicker' }));
vi.mock('@/components/disclosure', () => ({ Disclosure: 'Disclosure' }));
vi.mock('@/components/settings-section', () => ({ SettingsSection: 'SettingsSection' }));
vi.mock('@/components/blocked-users', () => ({ BlockedUsers: 'BlockedUsers' }));
vi.mock('@/components/campaign-country-settings', () => ({ CampaignCountrySettings: 'Country' }));
vi.mock('@/providers/supabase-provider', () => ({
  useSupabase: () => ({
    status: 'signed-in',
    session: { user: { id: 'user', email: 'tour@example.invalid' } },
  }),
}));
vi.mock('@/providers/offline-provider', () => ({ useOffline: () => ({ records: [] }) }));
vi.mock('@/providers/notifications-provider', () => ({
  useNotifications: () => ({ state: 'off', version: 0 }),
}));
vi.mock('@/hooks/use-night-action', () => ({ useNightAction: () => ({ busy: false }) }));
vi.mock('@/hooks/use-account-query', () => ({
  useAccountQuery: () => ({ data: runtime.data, loading: runtime.loading }),
}));
vi.mock('@/providers/theme-provider', async () => {
  const { lightColors, makeTypography } = await import('@/theme/tokens');
  const typography = makeTypography(lightColors);
  return {
    useTheme: () => ({ colors: lightColors, typography }),
    useThemedStyles: <T,>(factory: (colors: typeof lightColors, type: typeof typography) => T) =>
      factory(lightColors, typography),
  };
});
let root: ReactTestRenderer | null = null;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  runtime.loading = false;
});
afterEach(async () => {
  await act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});
async function mount(screen: ComponentType, data: unknown) {
  runtime.data = data;
  await act(() => {
    root = create(createElement(screen));
  });
}
function targetIds() {
  return root?.root
    .findAll((node) => String(node.type) === 'TourTarget')
    .map((node) => String(node.props['id']));
}
describe('tour targets on real screens', () => {
  it.each([
    { nights: [] },
    { nights: [{ id: 'night', title: 'Tonight', role: 'host', endsAt: '2026-10-08T23:00:00Z' }] },
  ])('wraps the actual Start and Join buttons with any active-night state', async ({ nights }) => {
    await mount(TonightScreen, nights);
    expect(targetIds()).toEqual(['start', 'join']);
    expect(
      root?.root
        .findByProps({ id: 'start' })
        .findAllByProps({ label: nights.length ? 'Start another night' : 'Start a night' }),
    ).toHaveLength(1);
    expect(
      root?.root.findByProps({ id: 'join' }).findAllByProps({ label: 'Join with an invite' }),
    ).toHaveLength(1);
  });
  it('targets the empty history state, then the first recap when history loads', async () => {
    await mount(HistoryScreen, { nights: [], hasMore: false });
    expect(root?.root.findByProps({ route: '/history' })).toBeDefined();
    expect(targetIds()).toEqual(['entries']);
    expect(
      root?.root
        .findByProps({ id: 'entries' })
        .findAllByProps({ children: 'No finished nights yet' }),
    ).toHaveLength(1);
    runtime.data = {
      nights: [
        {
          id: 'past',
          title: 'Friday',
          role: 'host',
          startsAt: '2026-10-02T20:00:00Z',
          timezone: 'UTC',
          alcoholCount: 0,
          waterCount: 0,
        },
      ],
      hasMore: false,
    };
    await act(() => root?.update(createElement(HistoryScreen)));
    expect(
      root?.root.findByProps({ id: 'entries' }).findAllByProps({ label: 'View recap for Friday' }),
    ).toHaveLength(1);
  });
  it('does not highlight a loading placeholder as a recap', async () => {
    runtime.loading = true;
    await mount(HistoryScreen, null);
    expect(targetIds()).toEqual([]);
  });
  it('targets notification status on Notifications', async () => {
    await mount(NotificationsScreen, []);
    expect(root?.root.findByProps({ route: '/notifications' })).toBeDefined();
    expect(targetIds()).toEqual(['notifications']);
    expect(
      root?.root.findByProps({ id: 'notifications' }).findAllByProps({ children: 'Off' }),
    ).toHaveLength(1);
  });
  it('targets the reminder row and appearance controls in Settings', async () => {
    await mount(AccountScreen, 'Alex');
    expect(root?.root.findByProps({ route: '/account' })).toBeDefined();
    expect(targetIds()).toEqual(['reminders', 'settings']);
    expect(
      root?.root.findByProps({ id: 'reminders' }).findAllByProps({ label: 'Night reminders' }),
    ).toHaveLength(1);
    expect(
      root?.root
        .findByProps({ id: 'settings' })
        .findAll((node) => String(node.type) === 'AppearancePicker'),
    ).toHaveLength(1);
  });
});
