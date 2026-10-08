/* eslint-disable @typescript-eslint/no-deprecated -- Verify actual screen composition and control handlers without a device. */
import { createElement, type ReactNode } from 'react';
import { act, create, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NightSnapshot } from '@dwd/core';
import NightScreen from '../../app/night/[nightId]/index';

const runtime = vi.hoisted(() => ({
  snapshot: null as NightSnapshot | null,
  push: vi.fn(),
  log: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ nightId: 'night' }),
  useFocusEffect: vi.fn(),
  useRouter: () => ({ push: runtime.push, replace: runtime.push }),
}));
vi.mock('react-native', () => ({
  Text: 'Text',
  View: 'View',
  RefreshControl: 'RefreshControl',
  ScrollView: 'ScrollView',
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('@/components/primary-button', () => ({ PrimaryButton: 'Button', Action: 'Button' }));
vi.mock('@/components/drink-log-button', () => ({ DrinkLogButton: 'LogButton' }));
vi.mock('@/components/night-people', () => ({ NightPeople: 'People' }));
vi.mock('@/components/night-check-ins', () => ({ NightCheckIns: 'CheckIns' }));
vi.mock('@/components/night-activity', () => ({ NightActivity: 'Entries' }));
vi.mock('@/components/screen', () => ({
  Screen: ({ children, footer }: { children: ReactNode; footer: ReactNode }) =>
    createElement('Screen', null, children, createElement('Footer', null, footer)),
  Panel: 'Panel',
  Notice: 'Notice',
  LoadingPanel: 'LoadingPanel',
  RetryPanel: 'RetryPanel',
}));
vi.mock('@/hooks/use-night', () => ({
  useNight: () => ({
    snapshot: runtime.snapshot,
    refresh: runtime.refresh,
    now: Date.parse('2026-10-07T18:00:00Z'),
    loading: false,
  }),
}));
vi.mock('@/hooks/use-logging', () => ({ useLogging: () => ({ busy: false, log: runtime.log }) }));
vi.mock('@/providers/supabase-provider', () => ({
  useSupabase: () => ({ client: null, session: null, status: 'signed-in' }),
}));
vi.mock('@/providers/connectivity-provider', () => ({ useConnectivity: () => ({ online: true }) }));
vi.mock('@/providers/offline-provider', () => ({ useOffline: () => ({ records: [] }) }));
vi.mock('@/providers/theme-provider', async () => {
  const { lightColors, makeTypography } = await import('@/theme/tokens');
  return { useTheme: () => ({ colors: lightColors, typography: makeTypography(lightColors) }) };
});
vi.mock('@/lib/automatic-invite', () => ({ ensureNightInvite: vi.fn() }));

function fixture(): NightSnapshot {
  const member = {
    id: 'member',
    userId: 'user',
    nightId: 'night',
    role: 'host',
    memberType: 'account',
    displayName: 'Alex',
    leftAt: null,
    managedByUserId: null,
    joinedAt: '2026-10-07T17:00:00Z',
    planSetupCompletedAt: '2026-10-07T17:00:00Z',
    planRevision: 1,
    planItems: [
      {
        id: 'shot',
        label: 'Shot',
        category: 'spirit',
        volumeMl: 40,
        abvPercent: 40,
        plannedQuantity: 5,
        isQuickLog: true,
        archivedAt: null,
      },
    ],
    drinkLogs: [],
    waterLogs: [],
  };
  return {
    currentUserId: 'user',
    currentMemberId: 'member',
    night: {
      id: 'night',
      hostUserId: 'user',
      title: 'Tonight',
      status: 'active',
      endsAt: '2026-10-07T23:00:00Z',
      timezone: 'Africa/Nairobi',
    },
    members: [
      member,
      {
        ...member,
        id: 'guest',
        userId: null,
        role: 'member',
        memberType: 'guest',
        managedByUserId: 'user',
        displayName: 'Jo',
      },
    ],
    alerts: [],
    sharedBottles: [
      {
        id: 'gin',
        label: 'Shared gin',
        pourMl: 30,
        remainingMl: 750,
        closedAt: null,
        access: 'everyone',
        allowedMemberIds: [],
        joinedMemberIds: [],
      },
    ],
  } as unknown as NightSnapshot;
}
let root: ReactTestRenderer;
function native(type: string) {
  return root.root.findAll((node) => typeof node.type === 'string' && node.type === type);
}
function visible(node: ReactTestInstance): boolean {
  for (let parent = node.parent; parent; parent = parent.parent)
    if (parent.props['accessibilityElementsHidden']) return false;
  return true;
}
function button(label: string) {
  return root.root.findAll(
    (node) => node.type === ('Button' as unknown) && node.props['label'] === label && visible(node),
  )[0];
}
async function press(label: string) {
  const control = button(label);
  expect(control, label).toBeDefined();
  await act(() => (control?.props['onPress'] as () => void)());
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  runtime.snapshot = fixture();
});
afterEach(async () => {
  await act(() => root.unmount());
  vi.unstubAllGlobals();
});
async function mount() {
  await act(() => {
    root = create(createElement(NightScreen));
  });
}

describe('active night controls', () => {
  it('renders the common actions and Entries in the body alongside the fixed main drink', async () => {
    await mount();
    expect(native('Entries')).toHaveLength(1);
    expect(
      native('Footer')[0]?.findAll((node) => node.type === ('LogButton' as unknown)),
    ).toHaveLength(1);
    await press('Log chaser');
    expect(runtime.log).toHaveBeenCalledWith('member', 'water');
    await press('Log another drink');
    expect(runtime.push).toHaveBeenLastCalledWith({
      pathname: '/night/night/log',
      params: { memberId: 'member' },
    });
    await press('Shared bottles');
    expect(runtime.push).toHaveBeenLastCalledWith({
      pathname: '/night/night/bottles',
      params: { memberId: 'member' },
    });
    expect(button('Edit plan')).toBeUndefined();
    await press('Night options');
    expect(button('Edit plan')).toBeDefined();
    expect(button('Add missed entries')).toBeDefined();
  });
  it('logs for the selected managed guest without changing another person', async () => {
    await mount();
    await press('Jo');
    await press('Log chaser');
    expect(runtime.log).toHaveBeenCalledWith('guest', 'water');
  });
  it('opens the new bottle directly at the join form without logging or switching a plan', async () => {
    await mount();
    await press('Join Shared gin, 30 ml per drink · 750 ml left');
    expect(runtime.push).toHaveBeenLastCalledWith({
      pathname: '/night/night/bottles',
      params: { memberId: 'member', bottleId: 'gin' },
    });
    expect(runtime.log).not.toHaveBeenCalled();
  });
  it.each(['empty', 'private', 'closed', 'planned'])(
    'does not offer a %s bottle to join',
    async (state) => {
      const bottle = runtime.snapshot?.sharedBottles?.[0];
      if (!bottle || !runtime.snapshot) throw new Error('Missing fixture');
      if (state === 'empty') bottle.remainingMl = 0;
      if (state === 'private') bottle.access = 'selected';
      if (state === 'closed') bottle.closedAt = '2026-10-07T18:00:00Z';
      const plan = runtime.snapshot.members[0]?.planItems[0];
      if (state === 'planned' && plan) plan.sharedBottleId = bottle.id;
      await mount();
      expect(button('Join Shared gin, 30 ml per drink · 750 ml left')).toBeUndefined();
      expect(button('Shared bottles')).toBeDefined();
    },
  );
  it('shows recap and Entries, with no logging controls, after the night ends', async () => {
    if (!runtime.snapshot) throw new Error('Missing fixture');
    runtime.snapshot.night.status = 'ended';
    await mount();
    expect(button('Log chaser')).toBeUndefined();
    expect(button('Log another drink')).toBeUndefined();
    expect(native('LogButton')).toHaveLength(0);
    expect(native('Entries')).toHaveLength(1);
    expect(button('View recap')).toBeDefined();
  });
});
