import { calculateEthanolGrams, type CustomDrinkInput, type NightSnapshot } from '@dwd/core';

// Deliberately non-UUID identifiers: these objects can never identify a real database record.
export function createTourNight(now = Date.now()): NightSnapshot {
  const started = new Date(now - 30 * 60_000).toISOString();
  const ends = new Date(now + 2 * 60 * 60_000).toISOString();
  const snapshot: NightSnapshot = {
    night: {
      id: 'tour',
      hostUserId: 'tour-you',
      title: 'Friday with friends',
      status: 'active',
      startsAt: started,
      initialEndsAt: ends,
      endsAt: ends,
      endedAt: null,
      timezone: 'UTC',
    },
    currentUserId: 'tour-you',
    currentMemberId: 'tour-member-you',
    alerts: [],
    endTimeChanges: [],
    members: ['You', 'Alex', 'Sam'].map((name, index) => {
      const id = index === 0 ? 'tour-member-you' : `tour-member-${index}`;
      return {
        id,
        nightId: 'tour',
        userId: index === 0 ? 'tour-you' : `tour-friend-${index}`,
        displayName: name,
        memberType: 'account',
        role: index === 0 ? 'host' : 'member',
        managedByUserId: null,
        joinedAt: started,
        leftAt: null,
        planSetupCompletedAt: started,
        planRevision: 0,
        planItems: [
          {
            id: `tour-plan-${index}`,
            nightMemberId: id,
            createdBy: 'tour-you',
            createdAt: started,
            updatedAt: started,
            archivedAt: null,
            label: 'Beer',
            category: 'beer',
            volumeMl: 330,
            abvPercent: 5,
            plannedQuantity: 3,
            isQuickLog: true,
          },
        ],
        drinkLogs: [],
        waterLogs: [],
      };
    }),
  };
  return snapshot.members.reduce(
    (state, member) => addTourDrink(state, 'water', undefined, member.id, now - 10 * 60_000),
    snapshot.members.reduce(
      (state, member) => addTourDrink(state, 'alcohol', undefined, member.id, now - 20 * 60_000),
      snapshot,
    ),
  );
}

export function addTourDrink(
  snapshot: NightSnapshot,
  kind: 'water' | 'alcohol',
  custom?: CustomDrinkInput,
  memberId = snapshot.currentMemberId,
  now = Date.now(),
): NightSnapshot {
  const time = new Date(now).toISOString();
  return {
    ...snapshot,
    members: snapshot.members.map((member) => {
      if (member.id !== memberId) return member;
      const id = `tour-log-${member.id}-${member.drinkLogs.length + member.waterLogs.length}`;
      const common = {
        id,
        nightId: 'tour',
        nightMemberId: member.id,
        actorUserId: 'tour-you',
        consumedAt: time,
        createdAt: time,
        idempotencyKey: id,
        deletedAt: null,
      };
      if (kind === 'water') return { ...member, waterLogs: [...member.waterLogs, common] };
      const drink = custom ?? member.planItems[0];
      if (!drink) return member;
      return {
        ...member,
        drinkLogs: [
          ...member.drinkLogs,
          {
            ...common,
            planItemId: custom ? null : (member.planItems[0]?.id ?? null),
            labelSnapshot: drink.label,
            categorySnapshot: drink.category,
            volumeMl: drink.volumeMl,
            abvPercent: drink.abvPercent,
            ethanolGrams: calculateEthanolGrams(drink.volumeMl, drink.abvPercent),
            afterEnd: false,
          },
        ],
      };
    }),
  };
}

export function undoTourDrink(snapshot: NightSnapshot): NightSnapshot {
  return {
    ...snapshot,
    members: snapshot.members.map((member) => {
      if (member.id !== snapshot.currentMemberId) return member;
      const water = member.waterLogs.at(-1);
      const drink = member.drinkLogs.at(-1);
      if (water && (!drink || water.createdAt >= drink.createdAt))
        return { ...member, waterLogs: member.waterLogs.slice(0, -1) };
      return { ...member, drinkLogs: member.drinkLogs.slice(0, -1) };
    }),
  };
}
