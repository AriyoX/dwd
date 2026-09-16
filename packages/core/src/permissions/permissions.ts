import type { Night, NightMember } from '../types/domain';

export interface PermissionContext {
  actorUserId: string;
  actorMembership: NightMember | null;
  targetMember: NightMember;
  night: Pick<Night, 'hostUserId' | 'status'>;
}

export function canUserReadNight(
  actorUserId: string,
  memberships: readonly NightMember[],
): boolean {
  return memberships.some((member) => member.userId === actorUserId && member.leftAt === null);
}

export function canUserManageMember(context: PermissionContext): boolean {
  return (
    context.actorMembership?.leftAt === null &&
    context.targetMember.memberType === 'guest' &&
    context.targetMember.leftAt === null &&
    context.targetMember.managedByUserId === context.actorUserId &&
    context.night.hostUserId === context.actorUserId
  );
}

export function canUserEditPlan(context: PermissionContext): boolean {
  if (context.actorMembership?.leftAt !== null) return false;
  if (
    context.targetMember.memberType === 'account' &&
    context.targetMember.userId === context.actorUserId &&
    context.targetMember.leftAt === null
  ) {
    return true;
  }
  return canUserManageMember(context);
}

export function canUserLogForMember(context: PermissionContext): boolean {
  if (context.night.status !== 'active' || context.actorMembership?.leftAt !== null) return false;
  if (
    context.targetMember.memberType === 'account' &&
    context.targetMember.userId === context.actorUserId &&
    context.targetMember.leftAt === null
  ) {
    return true;
  }
  return canUserManageMember(context);
}

export function canUserDeleteLog(
  context: PermissionContext,
  logActorUserId: string | null,
): boolean {
  if (context.targetMember.memberType === 'account') {
    return (
      context.targetMember.userId === context.actorUserId && logActorUserId === context.actorUserId
    );
  }
  return canUserManageMember(context) && logActorUserId === context.actorUserId;
}

export function canUserCreateManagedGuest(
  actorUserId: string,
  night: Pick<Night, 'hostUserId' | 'status'>,
  actorMembership: NightMember | null,
): boolean {
  return (
    night.status === 'active' &&
    night.hostUserId === actorUserId &&
    actorMembership?.role === 'host' &&
    actorMembership.leftAt === null
  );
}

export function canUserEndOrExtendNight(
  actorUserId: string,
  night: Pick<Night, 'hostUserId' | 'status'>,
): boolean {
  return night.status === 'active' && night.hostUserId === actorUserId;
}

export function canUserLeaveNight(
  actorUserId: string,
  night: Pick<Night, 'hostUserId' | 'status'>,
  membership: NightMember,
): boolean {
  return (
    night.status === 'active' &&
    night.hostUserId !== actorUserId &&
    membership.userId === actorUserId &&
    membership.leftAt === null
  );
}
