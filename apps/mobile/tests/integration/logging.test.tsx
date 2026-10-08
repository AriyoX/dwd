/* eslint-disable @typescript-eslint/no-deprecated -- Verify durable one-tap logging without a device. */
import { createElement, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NightSnapshot } from '@dwd/core';
import { useLogging } from '@/hooks/use-logging';
import { NativeLogOutbox, NativePendingLogStore } from '@/lib/offline-logging';

const runtime = vi.hoisted(() => ({
  outbox: null as NativeLogOutbox | null,
  snapshot: null as NightSnapshot | null,
  online: false as boolean | null,
  retry: vi.fn(),
  saved: vi.fn(),
  confirm: vi.fn(),
  next: 10,
}));
vi.mock('@/providers/supabase-provider', () => ({
  useSupabase: () => ({
    client: {},
    session: { user: { id: '00000000-0000-4000-8000-000000000001' }, access_token: 'fixture' },
  }),
}));
vi.mock('@/providers/offline-provider', () => ({
  useOffline: () => ({ outbox: runtime.outbox, retry: runtime.retry }),
}));
vi.mock('@/providers/connectivity-provider', () => ({
  useConnectivity: () => ({ online: runtime.online }),
}));
vi.mock('@/lib/confirm', () => ({ confirmAction: runtime.confirm }));
vi.mock('expo-crypto', () => ({
  randomUUID: () => `00000000-0000-4000-8000-${String(runtime.next++).padStart(12, '0')}`,
}));
vi.mock('expo-haptics', () => ({
  notificationAsync: () => Promise.resolve(),
  NotificationFeedbackType: { Success: 1 },
}));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const time = '2026-10-06T19:00:00.000Z';
function snapshot(): NightSnapshot {
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
type Sender = ConstructorParameters<typeof NativeLogOutbox>[1];
const send = vi.fn<Sender['send']>();
let root: ReactTestRenderer | null = null;
let logging: ReturnType<typeof useLogging>;
function Probe() {
  const value = useLogging(runtime.saved, runtime.snapshot);
  useEffect(() => {
    logging = value;
  }, [value]);
  return null;
}
async function mount() {
  await act(() => {
    root = create(createElement(Probe));
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(time));
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  });
  runtime.snapshot = snapshot();
  runtime.online = false;
  runtime.next = 10;
  runtime.outbox = new NativeLogOutbox(new NativePendingLogStore(localStorage, id(1)), {
    current: () => true,
    send,
    delete: () => Promise.resolve(),
  });
  runtime.retry.mockResolvedValue(undefined);
  runtime.confirm.mockResolvedValue(true);
  send.mockResolvedValue({ status: 'temporarily_failed', message: 'Network request failed' });
});
afterEach(async () => {
  await act(() => root?.unmount());
  root = null;
  runtime.outbox?.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('large-button logging behavior', () => {
  it('saves offline from one tap and ignores an accidental duplicate tap', async () => {
    await mount();
    let outcomes: boolean[] = [];
    await act(async () => {
      outcomes = await Promise.all([
        logging.log(id(2), { planItemId: id(4) }),
        logging.log(id(2), { planItemId: id(4) }),
      ]);
    });
    expect(outcomes).toEqual([true, false]);
    expect(runtime.outbox?.store.getAll()).toHaveLength(1);
    expect(runtime.saved).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
    expect(logging.notice).toBe("Saved. We'll update it when you're online.");
  });
  it('persists an outside-plan acknowledgment offline and sends it after reconnection', async () => {
    await mount();
    await act(async () => {
      await logging.log(id(2), { planItemId: id(4) });
    });
    vi.setSystemTime(new Date(Date.parse(time) + 601));
    await act(async () => {
      await logging.log(id(2), { planItemId: id(4) });
    });
    const records = runtime.outbox?.store.getAll();
    expect(records).toHaveLength(2);
    expect(records?.[1]).toMatchObject({
      status: 'pending',
      acknowledgePlanExceeded: true,
      attempted: false,
    });
    expect(runtime.confirm).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
    send.mockImplementation((record) =>
      Promise.resolve({
        status: 'created' as const,
        alerts: [],
        log: {
          id: record.idempotencyKey,
          nightId: record.nightId,
          nightMemberId: record.nightMemberId,
          actorUserId: record.actorUserId,
          consumedAt: record.consumedAt,
          createdAt: record.consumedAt,
          idempotencyKey: record.idempotencyKey,
          deletedAt: null,
          planItemId: record.planItemId ?? null,
          labelSnapshot: 'Beer',
          categorySnapshot: 'beer' as const,
          volumeMl: 330,
          abvPercent: 5,
          ethanolGrams: 13.02,
          afterEnd: false,
        },
      }),
    );
    await act(async () => {
      await runtime.outbox?.retryAll();
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0].acknowledgePlanExceeded).toBe(true);
    expect(runtime.outbox?.store.getAll()).toHaveLength(0);
  });
  it('does not keep an entry when the outside-plan confirmation is cancelled', async () => {
    await mount();
    await act(async () => {
      await logging.log(id(2), { planItemId: id(4) });
    });
    vi.setSystemTime(new Date(Date.parse(time) + 601));
    runtime.confirm.mockResolvedValueOnce(false);
    await act(async () => {
      expect(await logging.log(id(2), { planItemId: id(4) })).toBe(false);
    });
    expect(runtime.outbox?.store.getAll()).toHaveLength(1);
    expect(runtime.saved).toHaveBeenCalledOnce();
  });
  it('blocks a shared-bottle pour offline without queuing or changing inventory', async () => {
    const view = runtime.snapshot;
    const member = view?.members[0];
    const plan = member?.planItems[0];
    if (!view || !member || !plan) throw new Error('Missing fixture');
    plan.sharedBottleId = id(20);
    view.sharedBottles = [
      {
        id: id(20),
        nightId: id(3),
        creatorMemberId: id(2),
        label: 'Gin',
        category: 'spirit',
        volumeMl: 750,
        remainingMl: 750,
        abvPercent: 40,
        pourMl: 30,
        defaultQuantity: 1,
        access: 'everyone',
        allowedMemberIds: [],
        joinedMemberIds: [id(2)],
        closedAt: null,
      },
    ];
    await mount();
    await act(async () => {
      expect(await logging.log(id(2), { planItemId: id(4) })).toBe(false);
    });
    expect(runtime.outbox?.store.getAll()).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
    expect(view.sharedBottles[0]?.remainingMl).toBe(750);
    expect(logging.issue).toBe('Connect to the internet to log from a shared bottle.');
  });
});
