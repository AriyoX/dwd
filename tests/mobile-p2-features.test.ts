import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  DRINK_PRESETS,
  presetToPlanItem,
  type Database,
  type NightSnapshot,
  type NotificationEvent,
} from '@dwd/core';
import { startNightOut, submitSupportRequest, updateDisplayName } from '@dwd/data';
import {
  newNightDraft,
  materializeNightDraft,
  nightDraftKey,
  readNightDraft,
} from '../apps/mobile/src/lib/night-draft';
import {
  completedInviteOperation,
  inviteStateKey,
  readInviteState,
} from '../apps/mobile/src/lib/invite-state';
import { catchUpRecords } from '../apps/mobile/src/lib/catch-up';
import {
  notificationRoute,
  notificationTarget,
  pushPermissionAllowed,
  pushProjectId,
} from '../apps/mobile/src/lib/native-notifications';
import { readSupportDraft, supportDraftKey } from '../apps/mobile/src/lib/support-draft';
import { clearDeletedAccountData } from '../apps/mobile/src/lib/account-cleanup';
import { actorClient } from '../apps/mobile/src/lib/actor-client';
import { appleAppAssociation, androidAppAssociation } from '../apps/web/src/lib/mobile-links';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const owner = id(1);
function storage() {
  const values = new Map<string, string>();
  return {
    values,
    get length() {
      return values.size;
    },
    key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
function snapshot(): NightSnapshot {
  const time = new Date(Date.now() - 30 * 60_000).toISOString();
  const preset = DRINK_PRESETS[0];
  if (!preset) throw new Error('Missing fixture preset.');
  return {
    currentUserId: owner,
    currentMemberId: id(2),
    alerts: [],
    endTimeChanges: [],
    night: {
      id: id(3),
      hostUserId: owner,
      title: 'Night',
      status: 'active',
      startsAt: time,
      initialEndsAt: new Date(Date.now() + 3_600_000).toISOString(),
      endsAt: new Date(Date.now() + 3_600_000).toISOString(),
      endedAt: null,
      timezone: 'Africa/Nairobi',
    },
    members: [
      {
        id: id(2),
        nightId: id(3),
        userId: owner,
        role: 'host',
        memberType: 'account',
        displayName: 'Alex',
        managedByUserId: null,
        joinedAt: time,
        leftAt: null,
        planSetupCompletedAt: time,
        planRevision: 1,
        drinkLogs: [],
        waterLogs: [],
        planItems: [
          {
            ...presetToPlanItem(preset),
            id: id(4),
            nightMemberId: id(2),
            createdBy: owner,
            createdAt: time,
            updatedAt: time,
            archivedAt: null,
          },
        ],
      },
    ],
  };
}
afterEach(() => vi.restoreAllMocks());
describe('native draft recovery and setup', () => {
  it('restores date, timezone, solo choice and the creation key only for the same account', () => {
    const device = storage();
    const draft = {
      ...newNightDraft(owner, id(10)),
      withPeople: false,
      mode: 'water_only' as const,
      timezone: 'Africa/Nairobi',
    };
    device.setItem(nightDraftKey(owner), JSON.stringify(draft));
    expect(readNightDraft(device, owner)).toEqual(draft);
    expect(readNightDraft(device, id(99))).toBeNull();
    const command = materializeNightDraft(draft);
    expect(command).toMatchObject({
      creationKey: id(10),
      withPeople: false,
      guests: [],
      hostPlanItems: [],
      timezone: 'Africa/Nairobi',
    });
  });
  it('requires guest consent and an explicit plan while solo setup omits all guests', () => {
    const draft = {
      ...newNightDraft(owner, id(10)),
      mode: 'water_only' as const,
      guests: [
        {
          clientId: id(30),
          displayName: 'Sam',
          mode: 'water_only' as const,
          items: [],
          consent: false,
        },
      ],
    };
    expect(() => materializeNightDraft(draft)).toThrow('agreed');
    expect(materializeNightDraft({ ...draft, withPeople: false }).guests).toEqual([]);
    expect(
      materializeNightDraft({
        ...draft,
        guests: draft.guests.map((g) => ({ ...g, consent: true })),
      }).guests,
    ).toEqual([{ displayName: 'Sam', planItems: [] }]);
  });
  it('rejects unset, empty drink plans, invalid zones and nonexistent DST times', () => {
    const draft = newNightDraft(owner, id(10));
    expect(() => materializeNightDraft(draft)).toThrow('Choose');
    expect(() => materializeNightDraft({ ...draft, mode: 'drinks' })).toThrow('Choose');
    expect(() =>
      materializeNightDraft({ ...draft, mode: 'water_only', timezone: 'Bad/Zone' }),
    ).toThrow('time zone');
    expect(() =>
      materializeNightDraft({
        ...draft,
        mode: 'water_only',
        timezone: 'America/New_York',
        date: '2026-03-08',
        time: '02:30',
      }),
    ).toThrow('does not exist');
  });
  it('keeps an expired uncertain command intact and rejects malformed or cross-account stored data', () => {
    const device = storage();
    const draft = { ...newNightDraft(owner, id(10)), mode: 'water_only' as const };
    const command = { ...materializeNightDraft(draft), endsAt: '2020-01-01T00:00:00.000Z' };
    device.setItem(nightDraftKey(owner), JSON.stringify({ ...draft, attempt: command }));
    expect(readNightDraft(device, owner)?.attempt).toEqual(command);
    device.setItem(nightDraftKey(owner), JSON.stringify({ ...draft, owner: id(99) }));
    expect(() => readNightDraft(device, owner)).toThrow();
    device.setItem(nightDraftKey(owner), '{broken');
    expect(() => readNightDraft(device, owner)).toThrow();
    expect(device.getItem(nightDraftKey(owner))).toBe('{broken');
  });
  it('uses the recoverable start RPC with the original payload', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { nightId: id(3) }, error: null });
    const command = materializeNightDraft({ ...newNightDraft(owner, id(10)), mode: 'water_only' });
    await startNightOut({ rpc } as unknown as SupabaseClient<Database>, command, true);
    expect(rpc).toHaveBeenCalledWith(
      'start_night_out_recoverable',
      expect.objectContaining({ p_creation_key: id(10), p_ends_at: command.endsAt }),
    );
  });
});
describe('catch-up logging', () => {
  it('uses one approximate timestamp and distinct keys for drinks and chasers', () => {
    const night = snapshot();
    let key = 40;
    const records = catchUpRecords(night, id(2), 2, 1, 15, [], () => id(key++));
    expect(records.map((r) => r.kind)).toEqual(['alcohol', 'alcohol', 'water']);
    expect(new Set(records.map((r) => r.idempotencyKey)).size).toBe(3);
    expect(new Set(records.map((r) => r.consumedAt)).size).toBe(1);
    expect(records[0]?.customDrink).toMatchObject({ label: night.members[0]?.planItems[0]?.label });
  });
  it('rounds the join/setup floor up and keeps combined plan warnings for review', () => {
    const night = snapshot();
    const member = night.members[0];
    if (!member) throw new Error();
    const records = catchUpRecords(night, id(2), 3, 0, 60, [], () =>
      id(40 + Math.floor(Math.random() * 9999)),
    );
    expect(Date.parse(records[0]?.consumedAt ?? '')).toBe(Date.parse(member.joinedAt) + 1);
    expect(records[2]?.status).toBe('needs_confirmation');
    expect(records[2]?.acknowledgePlanExceeded).toBe(false);
  });
  it('does not retrospectively consume shared bottle inventory and rejects unauthorized/ended targets', () => {
    const night = snapshot();
    const plan = night.members[0]?.planItems[0];
    if (!plan) throw new Error();
    plan.sharedBottleId = id(60);
    expect(
      catchUpRecords(night, id(2), 1, 0, 15, [], () => id(40))[0]?.customDrink?.sharedBottleId,
    ).toBeUndefined();
    expect(() => catchUpRecords(night, id(99), 1, 0, 15, [], () => id(40))).toThrow();
    night.night.status = 'ended';
    expect(() => catchUpRecords(night, id(2), 1, 0, 15, [], () => id(40))).toThrow();
  });
  it('allows chasers without a drink plan, but validates batch sizes and approximate times', () => {
    const night = snapshot();
    const member = night.members[0];
    if (!member) throw new Error();
    member.planItems = [];
    expect(catchUpRecords(night, id(2), 0, 1, 0, [], () => id(40))).toHaveLength(1);
    expect(() => catchUpRecords(night, id(2), 1, 0, 0, [], () => id(40))).toThrow('main drink');
    expect(() => catchUpRecords(night, id(2), 0, 11, 0, [], () => id(40))).toThrow();
    expect(() => catchUpRecords(night, id(2), 0, 1, -5, [], () => id(40))).toThrow();
  });
});
describe('notifications and invitations', () => {
  it('accepts only matching-account notification payloads and safe, canonical routes', () => {
    const payload = {
      eventId: id(10),
      recipientUserId: owner,
      nightId: id(3),
      url: 'https://evil.test',
    };
    expect(notificationTarget(payload, owner)).toEqual({
      eventId: id(10),
      recipientUserId: owner,
      nightId: id(3),
    });
    expect(notificationTarget(payload, id(99))).toBeNull();
    expect(notificationTarget({ ...payload, nightId: 'javascript:bad' }, owner)).toBeNull();
    expect(
      notificationRoute({ nightId: id(3), deepLink: 'https://evil.test' } as NotificationEvent),
    ).toBe(`/night/${id(3)}`);
  });
  it('supports provisional permission and resolves only valid EAS project UUIDs', () => {
    expect(pushPermissionAllowed({ granted: false, ios: { status: 3 } })).toBe(true);
    expect(pushPermissionAllowed({ granted: false, ios: { status: 1 } })).toBe(false);
    expect(pushProjectId({ eas: { projectId: id(80) } }, undefined, undefined)).toBe(id(80));
    expect(pushProjectId(null, undefined, 'invalid')).toBeNull();
  });
  it('recovers the same replacement/revocation operation after restart and isolates accounts', () => {
    const device = storage();
    const state = {
      owner,
      nightId: id(3),
      token: 'a'.repeat(43),
      expiresAt: '2027-01-01T00:00:00.000Z',
      pending: {
        kind: 'replace' as const,
        token: 'b'.repeat(43),
        expiresAt: '2027-01-01T00:00:00.000Z',
      },
    };
    device.setItem(inviteStateKey(owner, id(3)), JSON.stringify(state));
    const restored = readInviteState(device, owner, id(3));
    expect(restored).toEqual({ ...state, disabled: false });
    expect(readInviteState(device, id(99), id(3)).token).toBeNull();
    expect(completedInviteOperation(restored, state.pending).token).toBe('b'.repeat(43));
    expect(completedInviteOperation(restored, { ...state.pending, kind: 'revoke' })).toMatchObject({
      token: null,
      expiresAt: null,
      pending: null,
    });
  });
  it('publishes app association data only with valid signing identifiers', () => {
    expect(appleAppAssociation(undefined)).toBeNull();
    expect(appleAppAssociation('ABCDEFGHIJ')?.applinks.details[0]?.paths).toEqual(['/join/*']);
    expect(androidAppAssociation('invalid')).toBeNull();
    expect(androidAppAssociation(Array(32).fill('AB').join(':'))?.[0]?.target.package_name).toBe(
      'com.dwd.app',
    );
  });
});
describe('profile, support and deletion boundaries', () => {
  it('validates and trims profile/support input before calling the server', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { displayName: 'Alex' }, error: null });
    const client = { rpc } as unknown as SupabaseClient<Database>;
    await updateDisplayName(client, '  Alex  ');
    expect(rpc).toHaveBeenCalledWith('update_own_display_name', { p_display_name: 'Alex' });
    await expect(updateDisplayName(client, ' ')).rejects.toThrow();
    await expect(
      submitSupportRequest(client, { requestKey: id(10), kind: 'problem', message: 'short' }),
    ).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('restores a frozen support request with its original key across restarts', () => {
    const device = storage();
    const request = {
      requestKey: id(10),
      kind: 'problem' as const,
      message: 'Something did not work.',
    };
    const draft = { owner, kind: request.kind, message: request.message, attempt: request };
    device.setItem(supportDraftKey(owner), JSON.stringify(draft));
    expect(readSupportDraft(device, owner).attempt).toEqual(request);
    expect(readSupportDraft(device, id(99)).attempt).toBeNull();
  });
  it('clears only the deleted account’s product data, retaining other users and device settings', () => {
    const device = storage();
    const own = [
      nightDraftKey(owner),
      supportDraftKey(owner),
      `dwd.mobile.cache.v1:${owner}:night`,
      inviteStateKey(owner, id(3)),
      `dwd.mobile.pending-logs.v1:${owner}`,
    ];
    const keep = [
      nightDraftKey(id(99)),
      'dwd.mobile.installation.v1',
      'dwd:mobile:appearance',
      'sb-project-auth-token',
    ];
    for (const key of [...own, ...keep]) device.setItem(key, 'value');
    clearDeletedAccountData(device, owner);
    expect([...device.values.keys()].sort()).toEqual(keep.sort());
  });
  it('pins the original actor token on a native registration request using the actual SDK', async () => {
    const headers: string[] = [];
    const client = createClient<Database>('https://project.supabase.co', 'public', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (_url, options) => {
          headers.push(new Headers(options?.headers).get('Authorization') ?? '');
          return Promise.resolve(new Response('{"registered":true}', { status: 200 }));
        },
      },
    });
    await actorClient(client, 'original-actor-token').rpc('register_native_push', {
      p_installation_id: id(10),
      p_token: 'ExpoPushToken[fixture]',
      p_platform: 'ios',
    });
    expect(headers).toEqual(['Bearer original-actor-token']);
  });
});
