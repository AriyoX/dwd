/* eslint-disable @typescript-eslint/no-deprecated, @typescript-eslint/no-non-null-assertion -- Mounted screen behavior and confirmed fixtures. */
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  lightTheme,
  quickLinkedMember,
  quickMainDrink,
  type NightSnapshot,
  type QuickSession,
} from '@dwd/core';
import { LinkedQuickLog } from '@/components/linked-quick-log';
const runtime = vi.hoisted(() => ({
  snapshot: null as NightSnapshot | null,
  log: vi.fn(),
  end: vi.fn(),
  finish: vi.fn(),
  alert: vi.fn(),
  records: [] as { nightId: string }[],
  online: true,
  account: '00000000-0000-4000-8000-000000000001',
  router: { push: vi.fn(), replace: vi.fn(), dismissTo: vi.fn() },
}));
vi.mock('react-native', () => ({
  Text: 'Text',
  View: 'View',
  Alert: { alert: runtime.alert },
  useWindowDimensions: () => ({ width: 390, fontScale: 1 }),
}));
vi.mock('expo-router', () => ({ useRouter: () => runtime.router }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('@dwd/data', () => ({ endNight: runtime.end, softDeleteActivity: vi.fn() }));
vi.mock('@/hooks/use-night', () => ({
  useNight: () => ({ snapshot: runtime.snapshot, refresh: vi.fn(), now: Date.now() }),
}));
vi.mock('@/hooks/use-logging', () => ({ useLogging: () => ({ log: runtime.log, busy: false }) }));
vi.mock('@/hooks/use-night-action', () => ({
  useNightAction: () => ({
    run: async (work: () => Promise<void>, _message: string, saved?: () => void) => {
      try {
        await work();
        saved?.();
      } catch {
        /* Mimic failed writes preserving the session. */
      }
    },
    busy: false,
  }),
}));
vi.mock('@/providers/supabase-provider', () => ({
  useSupabase: () => ({
    session: { user: { id: runtime.account }, access_token: 'test' },
    client: {},
  }),
}));
vi.mock('@/providers/theme-provider', () => ({
  useTheme: () => ({ colors: lightTheme, typography: { body: {}, heading: {}, sectionTitle: {} } }),
}));
vi.mock('@/providers/offline-provider', () => ({
  useOffline: () => ({ records: runtime.records, outbox: null }),
}));
vi.mock('@/providers/connectivity-provider', () => ({
  useConnectivity: () => ({ online: runtime.online }),
}));
vi.mock('@/lib/actor-client', () => ({ actorClient: (client: unknown) => client }));
vi.mock('@/lib/offline-logging', () => ({ pendingForSnapshot: () => [] }));
vi.mock('@/components/primary-button', () => ({
  Action: ({ children, ...props }: { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
  PrimaryButton: (props: { label: string }) => <button {...props}>{props.label}</button>,
}));
vi.mock('@/components/screen', () => ({
  Screen: ({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) => (
    <main>
      {children}
      {footer}
    </main>
  ),
  Panel: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  Notice: ({ message }: { message: string }) => <p>{message}</p>,
}));
vi.mock('@/components/tonight-banners', () => ({ TonightBanners: () => <aside>Ads</aside> }));
vi.mock('@/components/night-activity', () => ({ NightActivity: () => null }));
vi.mock('@/components/quick-night-activity', () => ({ QuickNightActivity: () => null }));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const time = '2026-10-06T19:00:00.000Z';
function fixture(): NightSnapshot {
  return {
    currentUserId: id(1),
    currentMemberId: id(2),
    alerts: [],
    endTimeChanges: [],
    night: {
      id: id(3),
      title: 'Tonight',
      hostUserId: id(1),
      status: 'active',
      startsAt: '2026-10-06T18:00:00.000Z',
      initialEndsAt: '2026-10-06T21:00:00.000Z',
      endsAt: '2026-10-06T21:00:00.000Z',
      endedAt: null,
      timezone: 'UTC',
    },
    members: [
      {
        id: id(2),
        nightId: id(3),
        userId: id(1),
        displayName: 'Alex',
        memberType: 'account',
        role: 'host',
        managedByUserId: null,
        joinedAt: time,
        leftAt: null,
        planSetupCompletedAt: time,
        planRevision: 1,
        drinkLogs: [],
        waterLogs: [],
        planItems: [
          {
            id: id(4),
            nightMemberId: id(2),
            createdBy: id(1),
            createdAt: time,
            updatedAt: time,
            archivedAt: null,
            label: 'Beer',
            category: 'beer',
            volumeMl: 330,
            abvPercent: 5,
            plannedQuantity: 1,
            isQuickLog: true,
          },
        ],
      },
    ],
  };
}

let root: ReactTestRenderer | undefined;
let quick: QuickSession;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  runtime.snapshot = fixture();
  runtime.account = id(1);
  runtime.records = [];
  runtime.online = true;
  runtime.end.mockResolvedValue(undefined);
  quick = {
    id: id(10),
    scope: `account:${id(1)}`,
    schemaVersion: 3,
    claimedBy: null,
    createdAt: time,
    updatedAt: time,
    finishedAt: null,
    state: 'active',
    entries: [
      {
        id: id(11),
        sessionId: id(10),
        kind: 'drink',
        recordedAt: time,
        sequence: 1,
        revision: 1,
        updatedAt: time,
        removedAt: null,
        destination: { nightId: id(3), memberId: id(2), entryId: id(12), operationId: id(13) },
      },
    ],
  };
});
afterEach(async () => {
  await act(() => root?.unmount());
  vi.unstubAllGlobals();
});
async function mount() {
  await act(() => {
    root = create(
      <LinkedQuickLog
        quick={quick}
        writable
        issue={null}
        onFinish={runtime.finish}
        onStart={vi.fn()}
      />,
    );
  });
}
function button(label: string) {
  return root!.root.findAllByType('button').find((item) => item.props['label'] === label);
}
async function press(label: string) {
  const callback = button(label)!.props['onPress'] as () => void;
  await act(callback);
}
function choices() {
  return runtime.alert.mock.calls.at(-1)![2] as { text: string; onPress?: () => void }[];
}
it('logs the current main drink and chaser into the night, and follows plan changes', async () => {
  await mount();
  await press('Log Beer');
  await press('Chaser');
  expect(runtime.log).toHaveBeenNthCalledWith(1, id(2), { planItemId: id(4) });
  expect(runtime.log).toHaveBeenNthCalledWith(2, id(2), 'water');
  const member = runtime.snapshot!.members[0]!;
  member.planItems[0]!.archivedAt = time;
  member.planItems.push({ ...member.planItems[0]!, id: id(5), archivedAt: null, label: 'Wine' });
  await mount();
  await press('Log Wine');
  expect(runtime.log).toHaveBeenLastCalledWith(id(2), { planItemId: id(5) });
});
it('asks the host and keeps the session open if ending the night fails', async () => {
  await mount();
  await press('Finish session');
  expect(choices().map((choice) => choice.text)).toContain('End night too');
  runtime.end.mockRejectedValueOnce(new Error('offline'));
  await act(() => choices().find((choice) => choice.text === 'End night too')!.onPress!());
  expect(runtime.finish).not.toHaveBeenCalled();
  await act(() => choices().find((choice) => choice.text === 'End night too')!.onPress!());
  expect(runtime.finish).toHaveBeenCalledOnce();
});
it('lets an invite member finish only their own session', async () => {
  runtime.snapshot!.night.hostUserId = id(20);
  await mount();
  await press('Finish session');
  expect(choices().map((choice) => choice.text)).not.toContain('End night too');
  await act(() => choices().find((choice) => choice.text === 'Quick Log only')!.onPress!());
  expect(runtime.finish).toHaveBeenCalledOnce();
  expect(runtime.end).not.toHaveBeenCalled();
});
it.each(['queued', 'offline'])('does not end the night with %s entries', async (mode) => {
  if (mode === 'queued') runtime.records = [{ nightId: id(3) }];
  else runtime.online = false;
  await mount();
  await press('Finish session');
  expect(choices().map((choice) => choice.text)).not.toContain('End night too');
});
it('disables logging for finished sessions and ended nights', async () => {
  quick.state = 'finished';
  await mount();
  expect(button('Log Beer')!.props['disabled']).toBe(true);
  quick.state = 'active';
  runtime.snapshot!.night.status = 'ended';
  await mount();
  expect(button('Log Beer')!.props['disabled']).toBe(true);
});
it('never logs to another account or a departed membership', async () => {
  expect(
    quickLinkedMember(runtime.snapshot!, { nightId: id(3), memberId: id(2) }, id(20)),
  ).toBeNull();
  runtime.snapshot!.members[0]!.leftAt = time;
  await mount();
  expect(button('Log Beer')).toBeUndefined();
});
it('offers a choice when the invite member has no drink plan', async () => {
  runtime.snapshot!.members[0]!.planItems = [];
  expect(quickMainDrink(runtime.snapshot!.members[0]!)).toBeUndefined();
  await mount();
  await press('Choose a drink');
  expect(runtime.router.push).toHaveBeenCalledWith(`/night/${id(3)}/plan`);
});
