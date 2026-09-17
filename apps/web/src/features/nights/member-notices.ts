import {
  calculateLoggedEthanol,
  calculatePlanTotal,
  determinePersonalPaceAlert,
  determinePlanStatus,
  type AlcoholLog,
  type MemberSnapshot,
  type NightAlert,
} from '@dwd/core';

/** Personal notices also work offline, independently of server notification delivery. */
export function memberNotices(
  member: MemberSnapshot,
  logs: readonly AlcoholLog[],
  now: Date,
): NightAlert[] {
  const active = logs.filter(
    (log) =>
      log.nightMemberId === member.id &&
      log.deletedAt === null &&
      Date.parse(log.consumedAt) <= now.getTime(),
  );
  const latest = [...active].sort((a, b) => Date.parse(b.consumedAt) - Date.parse(a.consumedAt))[0];
  if (!latest) return [];
  const notices: NightAlert[] = [];
  const add = (type: 'personal_pace' | 'plan_reached', message: string) => {
    const id = `${type}:${member.id}:${latest.idempotencyKey}`;
    notices.push({
      id,
      nightId: member.nightId,
      nightMemberId: member.id,
      type,
      message,
      severity: 'caution',
      visibility: 'private',
      dedupeKey: id,
      createdAt: latest.consumedAt,
      expiresAt: null,
    });
  };
  if (determinePersonalPaceAlert(active, member.id, now))
    add('personal_pace', 'Drinks are adding up quickly. Consider a pause and some water.');
  const status = determinePlanStatus(
    calculateLoggedEthanol(active),
    calculatePlanTotal(member.planItems),
  );
  if (status !== 'within_plan')
    add(
      'plan_reached',
      status === 'exceeded'
        ? 'You are over your plan. Consider switching to water.'
        : 'You have reached your plan. Consider switching to water.',
    );
  return notices;
}
