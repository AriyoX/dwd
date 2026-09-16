export type DrinkCategory = 'beer' | 'wine' | 'spirit' | 'cocktail' | 'other';
export type NightStatus = 'active' | 'ended';
export type MemberType = 'account' | 'guest';
export type MemberRole = 'host' | 'member';
export type AlertVisibility = 'private' | 'group';
export type PlanStatus = 'within_plan' | 'reached' | 'exceeded';
export type NightTimeStatus = 'active' | 'overdue' | 'ended';
export type PlanSetupMode = 'unselected' | 'water_only' | 'drinks';

export interface Night {
  id: string;
  hostUserId: string;
  title: string;
  status: NightStatus;
  startsAt: string;
  initialEndsAt: string;
  endsAt: string;
  endedAt: string | null;
  timezone: string;
}

export interface NightEndTimeChange {
  id: string;
  nightId: string;
  changedBy: string;
  previousEndsAt: string;
  newEndsAt: string;
  effectiveAt: string;
}

export interface NightMember {
  id: string;
  nightId: string;
  userId: string | null;
  displayName: string;
  memberType: MemberType;
  role: MemberRole;
  managedByUserId: string | null;
  joinedAt: string;
  leftAt: string | null;
  planSetupCompletedAt: string | null;
  planRevision: number;
}

export interface PlanItemInput {
  clientId?: string | undefined;
  id?: string | undefined;
  label: string;
  category: DrinkCategory;
  volumeMl: number;
  abvPercent: number;
  plannedQuantity: number;
  isQuickLog: boolean;
}

export interface PlanItem extends PlanItemInput {
  id: string;
  nightMemberId: string;
  createdBy: string | null;
  createdAt: string;
  archivedAt: string | null;
  updatedAt: string;
}

export interface AlcoholLog {
  id: string;
  nightId: string;
  nightMemberId: string;
  actorUserId: string | null;
  planItemId: string | null;
  labelSnapshot: string;
  categorySnapshot: DrinkCategory;
  volumeMl: number;
  abvPercent: number;
  ethanolGrams: number;
  consumedAt: string;
  createdAt: string;
  afterEnd: boolean;
  idempotencyKey: string;
  deletedAt: string | null;
}

export interface WaterLog {
  id: string;
  nightId: string;
  nightMemberId: string;
  actorUserId: string | null;
  consumedAt: string;
  createdAt: string;
  idempotencyKey: string;
  deletedAt: string | null;
}

export interface NightAlert {
  id: string;
  nightId: string;
  nightMemberId: string | null;
  type: 'personal_pace' | 'group_check_in' | 'plan_reached';
  severity: 'info' | 'caution' | 'urgent';
  visibility: AlertVisibility;
  message: string;
  dedupeKey: string;
  createdAt: string;
  expiresAt: string | null;
}

export interface MemberSnapshot extends NightMember {
  planItems: PlanItem[];
  drinkLogs: AlcoholLog[];
  waterLogs: WaterLog[];
}

export interface NightSnapshot {
  night: Night;
  currentUserId: string;
  currentMemberId: string;
  members: MemberSnapshot[];
  alerts: NightAlert[];
  endTimeChanges: NightEndTimeChange[];
  historyScope?: 'group' | 'personal';
}

export interface FinishedNight {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  endedAt: string | null;
  timezone: string;
  role: MemberRole;
  memberId: string;
  alcoholCount: number;
  waterCount: number;
  categoryCounts: Partial<Record<DrinkCategory, number>>;
}

export type NotificationCategory = 'group_attention' | 'direct_checkin' | 'personal_reminder';
export type NotificationEventType =
  'group_attention' | 'direct_checkin' | 'personal_pace' | 'planned_end' | 'periodic_water';

export interface NotificationPreferences {
  groupAttentionEnabled: boolean;
  directCheckinsEnabled: boolean;
  personalPaceEnabled: boolean;
  plannedEndEnabled: boolean;
  periodicWaterEnabled: boolean;
  periodicIntervalMinutes: 30 | 60 | 90;
}

export interface NotificationEvent {
  id: string;
  eventKey: string;
  recipientUserId: string;
  senderUserId: string | null;
  nightId: string | null;
  targetMemberId: string | null;
  category: NotificationCategory;
  eventType: NotificationEventType;
  title: string;
  body: string;
  deepLink: string;
  createdAt: string;
  expiresAt: string | null;
  acknowledgedAt: string | null;
}

export type CheckInResult =
  | { status: 'sent'; requestId: string; recipientUserId: string; message: string }
  | { status: 'local_only'; requestId: string | null; message: string }
  | { status: 'cooldown'; message: string };

export interface ActiveNightSummary {
  id: string;
  title: string;
  status: NightStatus;
  startsAt: string;
  endsAt: string;
  role: MemberRole;
  lastActivityAt: string;
}

export interface CustomDrinkInput {
  label: string;
  category: DrinkCategory;
  volumeMl: number;
  abvPercent: number;
}

export interface DrinkLogCommand {
  targetMemberId: string;
  planItemId?: string | undefined;
  customDrink?: CustomDrinkInput | undefined;
  consumedAt: string;
  idempotencyKey: string;
  acknowledgePlanExceeded: boolean;
  acknowledgeAfterEnd: boolean;
}

export type DrinkLogResult =
  | { status: 'created'; log: AlcoholLog; alerts: NightAlert[] }
  | { status: 'duplicate'; log: AlcoholLog; alerts: NightAlert[] }
  | {
      status: 'confirmation_required';
      warnings: Array<'plan_exceeded' | 'after_end'>;
      message: string;
    }
  | { status: 'temporarily_failed'; message: string }
  | { status: 'permanently_rejected'; code: string; message: string };

export type WaterLogResult =
  | { status: 'created'; log: WaterLog }
  | { status: 'duplicate'; log: WaterLog }
  | { status: 'temporarily_failed'; message: string }
  | { status: 'permanently_rejected'; code: string; message: string };

export type InvitationPreview =
  | {
      valid: true;
      nightTitle: string;
      hostDisplayName: string;
      startsAt: string;
      endsAt: string;
      timezone: string;
    }
  | {
      valid: false;
      reason?: 'invalid' | 'expired' | 'revoked' | 'full' | 'ended' | undefined;
    };
