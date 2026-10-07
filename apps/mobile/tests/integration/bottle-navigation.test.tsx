/* eslint-disable @typescript-eslint/no-deprecated -- Exercise native navigation without a device. */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NightSnapshot } from '@dwd/core';
import type * as Data from '@dwd/data';
import BottlesScreen from '../../app/night/[nightId]/bottles';

const runtime = vi.hoisted(() => ({
  snapshot: null as NightSnapshot | null,
  memberId: undefined as string | undefined,
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  plan: vi.fn(),
  log: vi.fn(),
}));
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ nightId: 'night', memberId: runtime.memberId }),
  useRouter: () => ({ replace: runtime.replace, push: runtime.push }),
}));
vi.mock('react-native', () => ({
  Text: 'Text',
  View: 'View',
  RefreshControl: 'RefreshControl',
  Keyboard: { dismiss: vi.fn() },
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000010' }));
vi.mock('@dwd/data', async (original) => ({
  ...(await original<typeof Data>()),
  planSharedBottle: runtime.plan,
}));
vi.mock('@/components/primary-button', () => ({ PrimaryButton: 'Button', Action: 'Button' }));
vi.mock('@/components/choice', () => ({ Choice: 'Choice' }));
vi.mock('@/components/drink-quantity', () => ({ DrinkQuantity: 'DrinkQuantity' }));
vi.mock('@/components/shared-bottle-fields', () => ({ SharedBottleFields: 'BottleFields' }));
vi.mock('@/components/settings-row', () => ({ SettingsRow: 'SettingsRow' }));
vi.mock('@/components/text-field', () => ({ TextField: 'TextField' }));
vi.mock('@/components/screen', () => ({
  Screen: 'Screen',
  Panel: 'Panel',
  Notice: 'Notice',
  LoadingPanel: 'LoadingPanel',
  RetryPanel: 'RetryPanel',
}));
vi.mock('@/hooks/use-night', () => ({
  useNight: () => ({ snapshot: runtime.snapshot, refresh: runtime.refresh, loading: false }),
  useNow: () => Date.now(),
}));
vi.mock('@/hooks/use-logging', () => ({ useLogging: () => ({ busy: false, log: runtime.log }) }));
vi.mock('@/providers/supabase-provider', () => ({
  useSupabase: () => ({ client: {}, session: { user: { id: 'user' }, access_token: 'test' } }),
}));
vi.mock('@/providers/connectivity-provider', () => ({ useConnectivity: () => ({ online: true }) }));
vi.mock('@/providers/theme-provider', () => ({
  useTheme: () => ({ colors: {}, typography: {} }),
}));

function fixture(): NightSnapshot {
  return {
    currentUserId: 'user',
    currentMemberId: 'member',
    night: { id: 'night', hostUserId: 'user', status: 'active' },
    members: [
      {
        id: 'member',
        userId: 'user',
        role: 'host',
        memberType: 'account',
        displayName: 'Alex',
        leftAt: null,
        planItems: [],
        drinkLogs: [],
        planRevision: 0,
      },
      {
        id: 'guest',
        userId: null,
        role: 'member',
        memberType: 'guest',
        managedByUserId: 'user',
        displayName: 'Jo',
        leftAt: null,
        planItems: [],
        drinkLogs: [],
        planRevision: 0,
      },
    ],
    sharedBottles: [
      {
        id: 'bottle',
        label: 'Shared gin',
        category: 'spirit',
        volumeMl: 750,
        remainingMl: 750,
        pourMl: 30,
        abvPercent: 40,
        defaultQuantity: 2,
        creatorMemberId: 'friend',
        access: 'everyone',
        joinedMemberIds: [],
        allowedMemberIds: [],
        closedAt: null,
      },
    ],
  } as unknown as NightSnapshot;
}
let root: ReactTestRenderer | null = null;
function native(type: string) {
  return root?.root.findAll((node) => typeof node.type === 'string' && node.type === type) ?? [];
}
async function press(label: string | RegExp) {
  const button = native('Button').find((node) =>
    typeof label === 'string'
      ? node.props['label'] === label
      : label.test(String(node.props['label'])),
  );
  expect(button).toBeDefined();
  await act(async () => {
    const onPress = button?.props['onPress'] as () => void | Promise<void>;
    await onPress();
  });
}
async function mount() {
  await act(() => {
    root = create(createElement(BottlesScreen));
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  runtime.snapshot = fixture();
  runtime.memberId = undefined;
  runtime.refresh.mockResolvedValue(undefined);
  runtime.plan.mockResolvedValue(runtime.snapshot);
});
afterEach(async () => {
  await act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});
describe('shared bottle navigation', () => {
  it.each([undefined, 'guest'])(
    'opens drinks after joining for %s without logging automatically',
    async (memberId) => {
      runtime.memberId = memberId;
      await mount();
      await press('Join bottle');
      expect(runtime.replace).not.toHaveBeenCalled();
      await press(/^Join (bottle|and start tracking)$/);
      expect(runtime.plan).toHaveBeenCalledOnce();
      expect(runtime.refresh).toHaveBeenCalledOnce();
      expect(runtime.replace).toHaveBeenCalledExactlyOnceWith({
        pathname: '/night/night/log',
        params: { memberId: memberId ?? 'member' },
      });
      expect(runtime.log).not.toHaveBeenCalled();
    },
  );
  it('keeps the join form open when the save fails', async () => {
    runtime.plan.mockRejectedValue(new Error('Disconnected'));
    await mount();
    await press('Join bottle');
    await press(/^Join (bottle|and start tracking)$/);
    expect(runtime.replace).not.toHaveBeenCalled();
    expect(native('Notice').some((node) => node.props['error'] === true)).toBe(true);
  });
  it('keeps an existing bottle adjustment on the shelf', async () => {
    const member = runtime.snapshot?.members[0];
    const bottle = runtime.snapshot?.sharedBottles?.[0];
    if (!member || !bottle) throw new Error('Missing bottle fixture');
    member.planItems = [
      {
        id: 'plan',
        sharedBottleId: 'bottle',
        archivedAt: null,
        volumeMl: 30,
        plannedQuantity: 2,
        isQuickLog: true,
      },
    ] as typeof member.planItems;
    bottle.joinedMemberIds = ['member'];
    await mount();
    await press('Adjust drinks');
    await press('Save changes');
    expect(runtime.plan).toHaveBeenCalledOnce();
    expect(runtime.replace).not.toHaveBeenCalled();
    expect(native('Notice').some((node) => node.props['message'] === 'Bottle plan saved.')).toBe(
      true,
    );
  });
});
