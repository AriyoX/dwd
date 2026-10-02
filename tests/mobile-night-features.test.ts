import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  presetToPlanItem,
  DRINK_PRESETS,
  type Database,
  type MemberSnapshot,
  type NightSnapshot,
  type NotificationEvent,
  type SharedBottle,
} from '@dwd/core';
import {
  addManagedGuest,
  planSharedBottle,
  shareBottleAndPlan,
  sendCheckIn,
  setBottleMembership,
  softDeleteActivity,
  visibleAlerts,
} from '@dwd/data';
import {
  availableBottles,
  bottleLogIssue,
  featureError,
  materializeBottle,
  materializeBottlePlan,
  materializeGuest,
  nightAccess,
  nightEvents,
  RetryKeys,
  type BottleDraft,
} from '../apps/mobile/src/lib/night-features';
import {
  AuthHandoff,
  captureNativeDestination,
  safeDestination,
} from '../apps/mobile/src/lib/auth-state';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function take<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined) throw new Error('Missing fixture');
  return value;
}
const now = Date.parse('2026-10-02T18:00:00Z');
function member(n: number, guest = false): MemberSnapshot {
  return {
    id: id(n),
    nightId: id(10),
    userId: guest ? null : id(n + 20),
    displayName: `Person ${n}`,
    memberType: guest ? 'guest' : 'account',
    role: n === 1 ? 'host' : 'member',
    managedByUserId: guest ? id(21) : null,
    joinedAt: new Date(now).toISOString(),
    leftAt: null,
    planSetupCompletedAt: new Date(now).toISOString(),
    planRevision: 4,
    planItems: [],
    drinkLogs: [],
    waterLogs: [],
  };
}
function bottle(n = 30): SharedBottle {
  return {
    id: id(n),
    nightId: id(10),
    creatorMemberId: id(1),
    label: 'Wine',
    category: 'wine',
    volumeMl: 750,
    abvPercent: 12,
    pourMl: 150,
    access: 'everyone',
    allowedMemberIds: [],
    joinedMemberIds: [id(1)],
    remainingMl: 750,
    closedAt: null,
  };
}
function snapshot(): NightSnapshot {
  return {
    currentUserId: id(21),
    currentMemberId: id(1),
    members: [member(1), member(2), member(3, true)],
    night: {
      id: id(10),
      hostUserId: id(21),
      title: 'Night',
      status: 'active',
      startsAt: new Date(now).toISOString(),
      initialEndsAt: new Date(now + 3600000).toISOString(),
      endsAt: new Date(now + 3600000).toISOString(),
      endedAt: null,
      timezone: 'Africa/Kampala',
    },
    sharedBottles: [bottle()],
    alerts: [],
    endTimeChanges: [],
  };
}
function rpcClient(result: unknown = snapshot()) {
  const rpc = vi.fn().mockResolvedValue({ data: result, error: null });
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
}

describe('native managed guests and group permissions', () => {
  it('allows the active host to manage their guests, while account users keep ownership of their plans and logs', () => {
    const night = snapshot();
    expect(nightAccess(night).canAddGuest).toBe(true);
    expect(nightAccess(night, id(3))).toMatchObject({
      canEdit: true,
      canManage: true,
      canLog: true,
      canCheckIn: false,
    });
    expect(nightAccess(night, id(2))).toMatchObject({
      canEdit: false,
      canManage: false,
      canLog: false,
      canCheckIn: true,
    });
    take(night.members, 2).managedByUserId = id(99);
    expect(nightAccess(night, id(3)).canManage).toBe(false);
  });
  it('routes check-ins for a guest to their manager and excludes self, departed people, ended nights and unknown targets', async () => {
    const night = snapshot();
    night.currentUserId = id(22);
    night.currentMemberId = id(2);
    expect(nightAccess(night, id(3)).canCheckIn).toBe(true);
    expect(nightAccess(night).canCheckIn).toBe(false);
    expect(nightAccess(night).canAddGuest).toBe(false);
    expect(nightAccess(night, id(99)).canLog).toBe(false);
    const { client, rpc } = rpcClient({ status: 'sent', requestId: id(40) });
    await sendCheckIn(client, night.night.id, id(3), id(50));
    expect(rpc).toHaveBeenCalledWith('send_check_in', {
      p_night_id: id(10),
      p_target_member_id: id(3),
      p_request_key: id(50),
    });
    take(night.members, 2).leftAt = new Date(now).toISOString();
    expect(nightAccess(night, id(3)).canCheckIn).toBe(false);
    night.night.status = 'ended';
    expect(nightAccess(night, id(1)).canCheckIn).toBe(false);
    expect(nightAccess(night).canLog).toBe(false);
  });
  it('revokes guest editing and creation as soon as the host leaves', () => {
    const night = snapshot();
    take(night.members, 0).leftAt = new Date(now).toISOString();
    expect(nightAccess(night, id(3))).toMatchObject({
      canManage: false,
      canEdit: false,
      canLog: false,
      canAddGuest: false,
    });
  });
  it('requires an explicit plan choice, validates names and treats chaser-only as an empty plan', () => {
    expect(materializeGuest('Guest', 'unselected', []).success).toBe(false);
    expect(materializeGuest('Guest', 'drinks', []).success).toBe(false);
    expect(materializeGuest('  ', 'water_only', []).success).toBe(false);
    expect(materializeGuest('  Guest  ', 'water_only', [])).toEqual({
      success: true,
      data: { displayName: 'Guest', planItems: [] },
    });
    expect(
      materializeGuest('Guest', 'drinks', [
        { ...presetToPlanItem(take(DRINK_PRESETS, 0)), isQuickLog: true },
      ]).success,
    ).toBe(true);
  });
  it('reuses the same guest request after an uncertain response', async () => {
    const { client, rpc } = rpcClient();
    rpc.mockRejectedValueOnce(new Error('Disconnected'));
    const keys = new RetryKeys(() => id(50));
    const add = () =>
      addManagedGuest(client, id(10), 'Guest', [], keys.get(`${id(21)}:${id(10)}:guest`));
    await expect(add()).rejects.toThrow('Disconnected');
    await add();
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  });
});

describe('native shared bottle plans and logging', () => {
  const draft: BottleDraft = {
    id: id(30),
    label: 'Wine',
    category: 'wine',
    volumeMl: '750',
    abvPercent: '12,5',
    pourMl: '150',
    defaultQuantity: '2',
    access: 'selected',
    allowedMemberIds: [id(2), id(2)],
  };
  it('validates volume and strength, accepts decimal commas and includes the actor and managed guest in restricted access', () => {
    const parsed = materializeBottle(draft, id(3), id(1));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.abvPercent).toBe(12.5);
      expect(parsed.data.allowedMemberIds).toEqual([id(2), id(1), id(3)]);
    }
    expect(materializeBottle({ ...draft, pourMl: '800' }, id(1), id(1)).success).toBe(false);
    expect(materializeBottle({ ...draft, defaultQuantity: '0' }, id(1), id(1)).success).toBe(false);
    expect(materializeBottle({ ...draft, abvPercent: '' }, id(1), id(1)).success).toBe(false);
    expect(materializeBottlePlan('2.5', '150').success).toBe(false);
    expect(materializeBottlePlan('2', '20,5').success).toBe(true);
  });
  it('shows only bottles available to the selected person', () => {
    const night = snapshot();
    const restricted = { ...bottle(31), access: 'selected' as const, allowedMemberIds: [id(1)] };
    night.sharedBottles = [...(night.sharedBottles ?? []), restricted];
    expect(availableBottles(night, id(3)).map((b) => b.id)).toEqual([id(30)]);
    expect(availableBottles(night, id(1)).map((b) => b.id)).toEqual([id(30), id(31)]);
  });
  it('blocks logging from closed, unjoined, inaccessible or insufficient bottles without blocking chasers', () => {
    const night = snapshot();
    const drink = {
      customDrink: {
        sharedBottleId: id(30),
        label: 'Wine',
        category: 'wine' as const,
        volumeMl: 150,
        abvPercent: 12,
      },
    };
    expect(bottleLogIssue(night, id(1), drink)).toBeNull();
    expect(bottleLogIssue(night, id(3), drink)).toContain('no longer available');
    take(night.sharedBottles ?? [], 0).remainingMl = 100;
    expect(bottleLogIssue(night, id(1), drink)).toContain('100 ml');
    take(night.sharedBottles ?? [], 0).closedAt = new Date(now).toISOString();
    expect(bottleLogIssue(night, id(1), drink)).toContain('no longer available');
    expect(bottleLogIssue(night, id(1), 'water')).toBeNull();
  });
  it('preserves the original revision and action key for create and plan retries', async () => {
    const { client, rpc } = rpcClient();
    const parsed = materializeBottle(draft, id(3), id(1));
    if (!parsed.success) throw new Error('Invalid fixture');
    await shareBottleAndPlan(client, id(10), parsed.data, id(3), 4, id(50));
    expect(rpc).toHaveBeenLastCalledWith(
      'share_bottle_and_plan',
      expect.objectContaining({
        p_member_id: id(3),
        p_expected_revision: 4,
        p_request_key: id(50),
      }),
    );
    await planSharedBottle(client, id(30), id(3), 2, 150, 4, id(50), false);
    expect(rpc).toHaveBeenLastCalledWith('plan_shared_bottle', {
      p_bottle_id: id(30),
      p_member_id: id(3),
      p_quantity: 2,
      p_serving_ml: 150,
      p_expected_revision: 4,
      p_request_key: id(50),
      p_make_main: false,
    });
  });
  it('surfaces the server boundary when leaving a planned bottle and uses normal activity undo to restore volume', async () => {
    const { client, rpc } = rpcClient();
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Remove this bottle from your plan before leaving.' },
    });
    await expect(setBottleMembership(client, id(30), id(3), false)).rejects.toMatchObject({
      message: 'Remove this bottle from your plan before leaving.',
    });
    expect(
      featureError({ message: 'Remove this bottle from your plan before leaving.' }),
    ).toContain('plan before leaving');
    await softDeleteActivity(client, id(60), 'alcohol');
    expect(rpc).toHaveBeenLastCalledWith('soft_delete_activity', {
      p_log_id: id(60),
      p_kind: 'alcohol',
    });
  });
});

describe('native check-in privacy, retries and destinations', () => {
  it('isolates retry identities by account, night and recipient and rotates them only after a definite response', () => {
    let sequence = 60;
    const keys = new RetryKeys(() => id(sequence++));
    const scope = `${id(21)}:${id(10)}:${id(3)}`;
    const original = keys.get(scope);
    expect(keys.get(scope)).toBe(original);
    expect(keys.get(`${id(22)}:${id(10)}:${id(3)}`)).not.toBe(original);
    expect(keys.get(`${id(21)}:${id(11)}:${id(3)}`)).not.toBe(original);
    keys.complete(scope);
    expect(keys.get(scope)).not.toBe(original);
    expect(
      featureError({ message: 'You already sent a check-in. Try again in a moment.' }),
    ).toContain('already sent');
  });
  it('never exposes another account’s events, another night or expired requests', () => {
    const event: NotificationEvent = {
      id: id(60),
      eventKey: `checkin:${id(50)}`,
      recipientUserId: id(21),
      senderUserId: id(22),
      nightId: id(10),
      targetMemberId: id(1),
      category: 'direct_checkin',
      eventType: 'direct_checkin',
      title: 'Check-in',
      body: 'Check-in',
      deepLink: `/night/${id(10)}`,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 1000).toISOString(),
      acknowledgedAt: null,
    };
    const events = [
      event,
      { ...event, id: id(61), recipientUserId: id(22) },
      { ...event, id: id(62), nightId: id(11) },
      { ...event, id: id(63), expiresAt: new Date(now).toISOString() },
    ];
    expect(nightEvents(events, id(21), id(10), now)).toEqual([event]);
  });
  it('preserves private pace alerts for the person and their manager only', () => {
    const night = snapshot();
    const base = {
      nightId: id(10),
      type: 'personal_pace' as const,
      severity: 'caution' as const,
      message: 'Pace',
      dedupeKey: 'x',
      createdAt: new Date(now).toISOString(),
      expiresAt: null,
    };
    night.alerts = [
      { ...base, id: id(71), nightMemberId: id(2), visibility: 'private' },
      { ...base, id: id(72), nightMemberId: id(3), visibility: 'private' },
      { ...base, id: id(73), nightMemberId: id(2), visibility: 'group' },
    ];
    expect(visibleAlerts(night).map((a) => a.id)).toEqual([id(72), id(73)]);
  });
  it('retains all new native feature destinations through authentication and rejects malformed targets', () => {
    const store = new Map<string, string>();
    const handoff = new AuthHandoff({
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => {
        store.set(key, value);
      },
      removeItem: (key) => {
        store.delete(key);
      },
    });
    for (const route of ['guest', 'bottles', 'help', 'reminders']) {
      const destination = `/night/${id(10)}/${route}?memberId=${id(3)}`;
      expect(captureNativeDestination(`dwd://${destination}`, handoff)).toBe(destination);
      expect(handoff.read().next).toBe(destination);
    }
    expect(safeDestination(`/night/${id(10)}/bottles?memberId=other`)).toBe('/');
    expect(
      safeDestination(`/night/${id(10)}/bottles?memberId=${id(3)}&redirect=https://evil.test`),
    ).toBe('/');
  });
});
