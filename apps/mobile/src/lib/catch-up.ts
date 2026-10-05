import type { NightSnapshot } from '@dwd/core';
import { makePendingLog, type NativePendingLog } from './offline-logging';
import { nightAccess } from './night-features';

export function catchUpRecords(
  snapshot: NightSnapshot,
  memberId: string,
  drinks: number,
  chasers: number,
  minutesAgo: number,
  pending: readonly NativePendingLog[],
  newKey: () => string,
  now = Date.now(),
) {
  if (
    ![drinks, chasers].every((n) => Number.isInteger(n) && n >= 0 && n <= 10) ||
    drinks + chasers === 0 ||
    ![0, 15, 30, 60].includes(minutesAgo)
  )
    throw new Error('Choose up to 10 drinks and 10 chasers.');
  if (!nightAccess(snapshot, memberId).canLog) throw new Error('You cannot log for this person.');
  const member = snapshot.members.find((m) => m.id === memberId);
  if (!member) throw new Error('Participant unavailable.');
  const plans = member.planItems.filter((p) => !p.archivedAt);
  const main = plans.find((p) => p.isQuickLog) ?? plans[0];
  if (drinks > 0 && !main)
    throw new Error('Set a main drink in the plan before adding missed drinks.');
  const created = main ? Date.parse(main.createdAt) : 0;
  const setup = Date.parse(member.planSetupCompletedAt ?? '');
  const floor = Number.isFinite(setup) && Math.abs(created - setup) <= 1000 ? created : 0;
  const earliest = Math.max(
    Date.parse(snapshot.night.startsAt),
    Date.parse(member.joinedAt),
    floor,
  );
  const consumedAt = new Date(Math.max(earliest + 1, now - minutesAgo * 60_000)).toISOString();
  const records: NativePendingLog[] = [];
  for (let i = 0; i < drinks + chasers; i++) {
    // Match web catch-up: a measured custom serving, never a retrospective inventory pour.
    const choice =
      i < drinks && main
        ? {
            customDrink: {
              label: main.label,
              category: main.category,
              volumeMl: main.volumeMl,
              abvPercent: main.abvPercent,
            },
          }
        : ('water' as const);
    records.push(
      makePendingLog(snapshot, memberId, choice, [...pending, ...records], newKey(), consumedAt),
    );
  }
  return records;
}
export const plannedEndKey = (owner: string, nightId: string) =>
  `dwd.mobile.planned-end.v1:${owner}:${nightId}`;
