import { describe, expect, it } from 'vitest';
import {
  canUserCreateManagedGuest,
  canUserDeleteLog,
  canUserEditPlan,
  canUserEndOrExtendNight,
  canUserLeaveNight,
  canUserLogForMember,
  canUserReadNight,
  type PermissionContext,
} from './permissions';
import type { NightMember } from '../types/domain';

const host = member({ id: 'host-member', userId: 'host', role: 'host' });
const account = member({ id: 'account-member', userId: 'account' });
const guest = member({
  id: 'guest-member',
  userId: null,
  memberType: 'guest',
  managedByUserId: 'host',
});
const activeNight = { hostUserId: 'host', status: 'active' as const };

describe('permission rules', () => {
  it('lets an account user edit and log only for self', () => {
    expect(canUserEditPlan(context('account', account, account))).toBe(true);
    expect(canUserLogForMember(context('account', account, account))).toBe(true);
    expect(canUserLogForMember(context('account', account, host))).toBe(false);
  });

  it('does not give the host control over another account user', () => {
    expect(canUserEditPlan(context('host', host, account))).toBe(false);
    expect(canUserLogForMember(context('host', host, account))).toBe(false);
    expect(canUserDeleteLog(context('host', host, account), 'account')).toBe(false);
  });

  it('lets only the host manager operate on a managed guest', () => {
    expect(canUserEditPlan(context('host', host, guest))).toBe(true);
    expect(canUserLogForMember(context('host', host, guest))).toBe(true);
    expect(canUserDeleteLog(context('host', host, guest), 'host')).toBe(true);
    expect(canUserCreateManagedGuest('host', activeNight, host)).toBe(true);
    expect(canUserCreateManagedGuest('account', activeNight, account)).toBe(false);
    expect(canUserLogForMember(context('account', account, guest))).toBe(false);
  });

  it('denies non-members and members who left', () => {
    expect(canUserReadNight('outsider', [host, account])).toBe(false);
    expect(canUserReadNight('account', [{ ...account, leftAt: '2026-07-31T21:00:00Z' }])).toBe(
      false,
    );
  });

  it('reserves ending and extending for the host', () => {
    expect(canUserEndOrExtendNight('host', activeNight)).toBe(true);
    expect(canUserEndOrExtendNight('account', activeNight)).toBe(false);
  });

  it('allows non-hosts to leave but never the active host', () => {
    expect(canUserLeaveNight('account', activeNight, account)).toBe(true);
    expect(canUserLeaveNight('host', activeNight, host)).toBe(false);
  });
});

function context(
  actorUserId: string,
  actorMembership: NightMember,
  targetMember: NightMember,
): PermissionContext {
  return { actorUserId, actorMembership, targetMember, night: activeNight };
}

function member(overrides: Partial<NightMember> & Pick<NightMember, 'id' | 'userId'>): NightMember {
  return {
    id: overrides.id,
    nightId: 'night',
    userId: overrides.userId,
    displayName: overrides.id,
    memberType: overrides.memberType ?? 'account',
    role: overrides.role ?? 'member',
    managedByUserId: overrides.managedByUserId ?? null,
    joinedAt: '2026-07-31T20:00:00Z',
    leftAt: overrides.leftAt ?? null,
  };
}
