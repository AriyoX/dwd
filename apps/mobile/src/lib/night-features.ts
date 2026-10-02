import {
  canUserCreateManagedGuest,
  canUserEditPlan,
  canUserLogForMember,
  canUserManageMember,
  guestInputSchema,
  planItemInputSchema,
  sharedBottleInputSchema,
  type CustomDrinkInput,
  type DrinkCategory,
  type NightSnapshot,
  type NotificationEvent,
  type PlanItemInput,
  type PlanSetupMode,
} from '@dwd/core';

export function nightAccess(snapshot: NightSnapshot, targetId = snapshot.currentMemberId) {
  const actor = snapshot.members.find((m) => m.id === snapshot.currentMemberId) ?? null;
  const member = snapshot.members.find((m) => m.id === targetId) ?? null;
  const active = snapshot.night.status === 'active' && actor?.leftAt === null;
  const context = member && {
    actorUserId: snapshot.currentUserId,
    actorMembership: actor,
    targetMember: member,
    night: snapshot.night,
  };
  return {
    actor,
    member,
    active,
    canAddGuest: canUserCreateManagedGuest(snapshot.currentUserId, snapshot.night, actor),
    canEdit: Boolean(active && context && canUserEditPlan(context)),
    canLog: Boolean(context && canUserLogForMember(context)),
    canManage: Boolean(active && context && canUserManageMember(context)),
    canCheckIn: Boolean(
      active &&
      member &&
      member.leftAt === null &&
      (member.userId ?? member.managedByUserId) &&
      member.userId !== snapshot.currentUserId &&
      member.managedByUserId !== snapshot.currentUserId,
    ),
  };
}

export function availableBottles(snapshot: NightSnapshot, memberId: string) {
  return (snapshot.sharedBottles ?? []).filter(
    (bottle) => bottle.access === 'everyone' || bottle.allowedMemberIds.includes(memberId),
  );
}

export function bottleLogIssue(
  snapshot: NightSnapshot,
  memberId: string,
  choice: { planItemId: string } | { customDrink: CustomDrinkInput } | 'water',
): string | null {
  if (choice === 'water') return null;
  const member = snapshot.members.find((m) => m.id === memberId);
  const drink =
    'customDrink' in choice
      ? choice.customDrink
      : member?.planItems.find((p) => p.id === choice.planItemId && !p.archivedAt);
  if (!drink?.sharedBottleId) return null;
  const bottle = availableBottles(snapshot, memberId).find((b) => b.id === drink.sharedBottleId);
  if (!bottle || bottle.closedAt || !bottle.joinedMemberIds.includes(memberId))
    return 'This bottle is no longer available. Choose another bottle or adjust the plan.';
  if (drink.volumeMl > bottle.remainingMl)
    return `Only ${bottle.remainingMl} ml is left. Adjust the drink size to log it.`;
  return null;
}

export function materializeGuest(name: string, mode: PlanSetupMode, items: PlanItemInput[]) {
  if (mode === 'unselected' || (mode === 'drinks' && !items.length))
    return { success: false as const, message: 'Choose a plan or chaser only.' };
  const result = guestInputSchema.safeParse({
    displayName: name,
    planItems: mode === 'water_only' ? [] : items,
  });
  return result.success
    ? { success: true as const, data: result.data }
    : {
        success: false as const,
        message: result.error.issues[0]?.message ?? 'Check the person’s plan.',
      };
}

export interface BottleDraft {
  id: string;
  label: string;
  category: DrinkCategory;
  volumeMl: string;
  abvPercent: string;
  pourMl: string;
  defaultQuantity: string;
  access: 'everyone' | 'selected';
  allowedMemberIds: string[];
}

export const decimal = (value: string) => Number(value.replace(',', '.'));

export function materializeBottle(draft: BottleDraft, memberId: string, creatorId: string) {
  return sharedBottleInputSchema.safeParse({
    ...draft,
    volumeMl: decimal(draft.volumeMl),
    abvPercent: decimal(draft.abvPercent),
    pourMl: decimal(draft.pourMl),
    defaultQuantity: decimal(draft.defaultQuantity),
    allowedMemberIds:
      draft.access === 'selected'
        ? [...new Set([...draft.allowedMemberIds, creatorId, memberId])]
        : [],
  });
}

export function materializeBottlePlan(quantity: string, size: string, bottleVolume = 2000) {
  return planItemInputSchema
    .refine((item) => item.volumeMl <= bottleVolume, { message: 'Check the drink size.' })
    .safeParse({
      label: 'Bottle',
      category: 'other',
      volumeMl: decimal(size),
      abvPercent: 1,
      plannedQuantity: decimal(quantity),
      isQuickLog: true,
    });
}

export function nightEvents(
  events: NotificationEvent[],
  owner: string,
  nightId: string,
  now: number,
) {
  return events
    .filter(
      (event) =>
        event.recipientUserId === owner &&
        event.nightId === nightId &&
        (!event.expiresAt || Date.parse(event.expiresAt) > now),
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

// A failed request keeps its identity until a definite response is received.
export class RetryKeys {
  private keys = new Map<string, string>();
  constructor(private readonly uuid: () => string) {}
  get(scope: string) {
    let key = this.keys.get(scope);
    if (!key) {
      key = this.uuid();
      this.keys.set(scope, key);
    }
    return key;
  }
  complete(scope: string) {
    this.keys.delete(scope);
  }
}

export function featureError(error: unknown) {
  const message =
    error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  const known = [
    'Bottle unavailable.',
    'Choose people from this night.',
    'Remove this bottle from your plan before leaving.',
    'Only the person sharing this bottle can put it away.',
    'This bottle is for selected people.',
    'This night has ended.',
    'This night is no longer active.',
    'Your plan changed. Close this window and try again.',
    'Your own plan changed. Close this window and try again.',
    'This bottle is already shared. Join or adjust it instead.',
    'This request belongs to another bottle.',
    'Check the drink size.',
    'Choose between 1 and 50 drinks.',
    'That participant is no longer active.',
    'You already sent a check-in. Try again in a moment.',
    'You manage this guest. Check in with them directly on this device.',
  ];
  if (known.includes(message)) return message;
  if (message === 'This plan changed in another tab. Reload and review it.')
    return 'This plan changed on another device. Close and reopen to load the latest plan.';
  if (message.includes('below activity already logged'))
    return 'The plan must cover drinks already logged. Increase the plan or undo an incorrect entry.';
  if (message.includes('between 0 and 20 items'))
    return 'The plan is full. Remove a drink before adding another bottle.';
  return 'Could not confirm the change. Check your connection and retry safely.';
}
