'use client';

import { Bell, ChevronDown, Clock3, LogOut, Pencil, Share2, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  calculateEthanolGrams,
  determineNightTimeStatus,
  projectedPlanStatus,
  requiredLogConfirmations,
  type CustomDrinkInput,
  type MemberSnapshot,
  type NightSnapshot,
  type PlanSetupMode,
} from '@dwd/core';
import type { PendingDrinkLog } from '@dwd/contracts';
import { Button } from '@/components/ui/button';
import { Card, Eyebrow } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { TonightView, ParticipantCard, DrinkChooser } from './night-content';
import { NightFrame } from './night-frame';
import { EmergencyPanel } from '@/features/alerts/emergency-panel';
import { deleteActivityAction } from '@/features/drink-logging/actions';
import { ShareInviteDialog } from '@/features/invites/share-invite-dialog';
import { createBrowserOutbox, type BrowserOutboxBundle } from '@/features/offline/browser-outbox';
import type { SyncOutcome } from '@/features/offline/outbox';
import {
  PlanEditor,
  draftItemsFromPlan,
  materializePlanDraft,
  type PlanDraftItem,
} from '@/features/plans/plan-editor';
import { NotificationInbox } from '@/features/notifications/notification-inbox';
import { sendCheckInAction } from '@/features/notifications/actions';
import {
  addGuestAction,
  endNightAction,
  extendNightAction,
  getNightSnapshotAction,
  leaveNightAction,
  removeGuestAction,
  replacePlanAction,
} from './actions';
import { NightRealtimeProvider, useRealtimeStatus } from '@/providers/realtime-provider';
import { useConnection } from '@/providers/connection-provider';

type Segment = 'tonight' | 'group' | 'more';
type ActivityKind = 'alcohol' | 'water';

interface DrinkDraft {
  member: MemberSnapshot;
  planItemId?: string;
  drinkSnapshot?: CustomDrinkInput;
  customDrink?: CustomDrinkInput;
  consumedAt: string;
  idempotencyKey: string;
  pendingKey?: string;
  warnings?: Array<'plan_exceeded' | 'after_end'>;
}

interface UndoTarget {
  id: string;
  kind: ActivityKind;
  memberId: string;
  memberName: string;
}

export function ActiveNightClient({
  initialSnapshot,
  openInviteInitially,
  setupPlanInitially,
}: {
  initialSnapshot: NightSnapshot;
  openInviteInitially: boolean;
  setupPlanInitially: boolean;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const router = useRouter();
  const refresh = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const result = await getNightSnapshotAction(snapshot.night.id);
      if (!result.ok) return;
      setSnapshot(result.data);
      if (result.data.night.status === 'ended') {
        router.replace(`/night/${result.data.night.id}/summary`);
      }
    } catch {
      // Keep the last snapshot through transport failures. Reconnect/focus and
      // the visible-page reconciliation timer retry without losing local work.
    }
  }, [router, snapshot.night.id]);

  return (
    <NightRealtimeProvider
      nightId={snapshot.night.id}
      memberIds={snapshot.members.map((member) => member.id)}
      onInvalidate={refresh}
    >
      <ActiveNightView
        snapshot={snapshot}
        setSnapshot={setSnapshot}
        refresh={refresh}
        openInviteInitially={openInviteInitially}
        setupPlanInitially={setupPlanInitially}
      />
    </NightRealtimeProvider>
  );
}

function ActiveNightView({
  snapshot,
  setSnapshot,
  refresh,
  openInviteInitially,
  setupPlanInitially,
}: {
  snapshot: NightSnapshot;
  setSnapshot: (snapshot: NightSnapshot) => void;
  refresh: () => Promise<void>;
  openInviteInitially: boolean;
  setupPlanInitially: boolean;
}) {
  const router = useRouter();
  const realtimeStatus = useRealtimeStatus();
  const { online, activityVersion } = useConnection();
  const [{ store, outbox }] = useState<BrowserOutboxBundle>(createBrowserOutbox);
  const [segment, setSegment] = useState<Segment>('tonight');
  const [now, setNow] = useState(() => new Date());
  const currentMember = snapshot.members.find((member) => member.id === snapshot.currentMemberId);
  if (currentMember === undefined) throw new Error('Current membership is missing.');
  const isHost = snapshot.night.hostUserId === snapshot.currentUserId;
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [drinkChooser, setDrinkChooser] = useState<MemberSnapshot | null>(null);
  const [confirmation, setConfirmation] = useState<DrinkDraft | null>(null);
  const [planMember, setPlanMember] = useState<MemberSnapshot | null>(
    setupPlanInitially && currentMember.planSetupCompletedAt === null ? currentMember : null,
  );
  const [planDraft, setPlanDraft] = useState<PlanDraftItem[]>(() =>
    draftItemsFromPlan(currentMember.planItems),
  );
  const [planMode, setPlanMode] = useState<PlanSetupMode>(
    currentMember.planSetupCompletedAt === null
      ? 'unselected'
      : currentMember.planItems.length === 0
        ? 'water_only'
        : 'drinks',
  );
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestToRemove, setGuestToRemove] = useState<MemberSnapshot | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestPlan, setGuestPlan] = useState<PlanDraftItem[]>([]);
  const [guestPlanMode, setGuestPlanMode] = useState<PlanSetupMode>('unselected');
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [overdueDismissedFor, setOverdueDismissedFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [undoTarget, setUndoTarget] = useState<UndoTarget | null>(null);
  const [pendingLogs, setPendingLogs] = useState<PendingDrinkLog[]>([]);
  const [checkInStates, setCheckInStates] = useState<
    Record<string, 'idle' | 'sending' | 'sent' | 'error'>
  >({});
  const checkInInFlight = useRef(new Set<string>());
  const checkInKeys = useRef(new Map<string, string>());
  const activityInFlight = useRef(false);
  const planSaveInFlight = useRef(false);
  const guestAddInFlight = useRef(false);
  const [customDrink, setCustomDrink] = useState<CustomDrinkInput>({
    label: 'Custom drink',
    category: 'other',
    volumeMl: 330,
    abvPercent: 5,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!openInviteInitially || !isHost) return;
    const key = `dwd-invite:${snapshot.night.id}`;
    const inviteErrorKey = `dwd-invite-error:${snapshot.night.id}`;
    let stored: string | null = null;
    let inviteError: string | null = null;
    try {
      stored = sessionStorage.getItem(key);
      inviteError = sessionStorage.getItem(inviteErrorKey);
      sessionStorage.removeItem(key);
      sessionStorage.removeItem(inviteErrorKey);
    } catch {
      /* A new invite can still be created when browser storage is unavailable. */
    }
    queueMicrotask(() => {
      if (stored !== null) setInviteUrl(stored);
      if (inviteError !== null) setMessage(inviteError);
      setInviteOpen(true);
    });
    const url = new URL(window.location.href);
    url.searchParams.delete('invite');
    router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
  }, [isHost, openInviteInitially, router, snapshot.night.id]);

  useEffect(() => {
    if (!setupPlanInitially) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('setup')) return;
    url.searchParams.delete('setup');
    router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
  }, [router, setupPlanInitially]);

  useEffect(() => {
    if (message === null) return;
    const timer = window.setTimeout(() => setMessage(null), 4_000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const loadPending = useCallback(async () => {
    const records = await store.getAll();
    setPendingLogs(
      records.filter(
        (record) =>
          record.nightId === snapshot.night.id && record.actorUserId === snapshot.currentUserId,
      ),
    );
  }, [snapshot.currentUserId, snapshot.night.id, store]);

  useEffect(() => {
    let active = true;
    const synchronize = async () => {
      const outcomes = online
        ? await outbox.retryAll(
            (record) =>
              record.nightId === snapshot.night.id && record.actorUserId === snapshot.currentUserId,
          )
        : [];
      if (!active) return;
      await loadPending();
      if (outcomes.some((outcome) => outcome.status === 'synced')) await refresh();
    };
    void synchronize().catch(() => {
      if (active) setMessage('Pending entries could not refresh. Retry when connected.');
    });
    return () => {
      active = false;
    };
  }, [
    activityVersion,
    loadPending,
    online,
    outbox,
    refresh,
    snapshot.currentUserId,
    snapshot.night.id,
  ]);

  const timeStatus = determineNightTimeStatus(snapshot.night, now);
  const anotherDialogOpen =
    inviteOpen ||
    drinkChooser !== null ||
    confirmation !== null ||
    planMember !== null ||
    guestOpen ||
    guestToRemove !== null ||
    emergencyOpen ||
    endOpen ||
    leaveOpen;
  const overdueOpen =
    timeStatus === 'overdue' && overdueDismissedFor !== snapshot.night.endsAt && !anotherDialogOpen;
  const remainingText = formatRemaining(snapshot.night.endsAt, now);
  const canonicalIdempotencyKeys = new Set(
    snapshot.members.flatMap((member) => [
      ...member.drinkLogs.map((log) => log.idempotencyKey),
      ...member.waterLogs.map((log) => log.idempotencyKey),
    ]),
  );
  const optimisticLogs = pendingLogs.filter(
    (record) => !canonicalIdempotencyKeys.has(record.idempotencyKey),
  );

  async function submitDrink(draft: DrinkDraft, acknowledge = false) {
    if (activityInFlight.current) return;
    activityInFlight.current = true;
    if (acknowledge && draft.pendingKey !== undefined) {
      setBusy(true);
      try {
        const stored = (await store.getAll()).find(
          (record) => record.idempotencyKey === draft.pendingKey,
        );
        if (stored === undefined) {
          setMessage('That pending entry is no longer on this device.');
          return;
        }
        const outcome = await outbox.confirmAndRetry(draft.pendingKey, draft.warnings ?? []);
        await loadPending();
        await handleSyncOutcome(outcome, stored);
      } catch {
        setMessage('The entry remains saved on this device. Retry when you are online.');
      } finally {
        setBusy(false);
        activityInFlight.current = false;
      }
      return;
    }
    const planItem =
      draft.planItemId === undefined
        ? undefined
        : draft.member.planItems.find((item) => item.id === draft.planItemId);
    const drinkValues = draft.customDrink ?? planItem ?? draft.drinkSnapshot;
    if (drinkValues === undefined) {
      setMessage('That plan item is no longer available. Choose another drink.');
      activityInFlight.current = false;
      return;
    }

    let previewWarnings: Array<'plan_exceeded' | 'after_end'>;
    try {
      previewWarnings = requiredLogConfirmations(
        projectedPlanStatus(
          draft.member.drinkLogs,
          draft.member.planItems,
          calculateEthanolGrams(drinkValues.volumeMl, drinkValues.abvPercent),
        ),
        Date.parse(draft.consumedAt) > Date.parse(snapshot.night.endsAt),
      );
    } catch {
      setMessage('Check the drink size and strength before logging.');
      activityInFlight.current = false;
      return;
    }
    const warnings = [...new Set([...(draft.warnings ?? []), ...previewWarnings])];
    if (!acknowledge && warnings.length > 0) {
      setDrinkChooser(null);
      setConfirmation({ ...draft, warnings });
      activityInFlight.current = false;
      return;
    }

    const record: PendingDrinkLog = {
      idempotencyKey: draft.idempotencyKey,
      kind: 'alcohol',
      actorUserId: snapshot.currentUserId,
      nightId: snapshot.night.id,
      nightMemberId: draft.member.id,
      memberDisplayName: draft.member.displayName,
      ...(draft.planItemId === undefined
        ? {}
        : { planItemId: draft.planItemId, planItemLabel: planItem?.label ?? drinkValues.label }),
      drinkSnapshot: {
        label: drinkValues.label,
        category: drinkValues.category,
        volumeMl: drinkValues.volumeMl,
        abvPercent: drinkValues.abvPercent,
      },
      ...(draft.customDrink === undefined ? {} : { customDrink: draft.customDrink }),
      consumedAt: draft.consumedAt,
      status: 'pending',
      retryCount: 0,
      requiredWarnings: warnings,
      acknowledgePlanExceeded: acknowledge && warnings.includes('plan_exceeded'),
      acknowledgeAfterEnd: acknowledge && warnings.includes('after_end'),
      createdLocallyAt: new Date().toISOString(),
    };

    setBusy(true);
    try {
      const outcome = await outbox.enqueue(record, online);
      await loadPending();
      await handleSyncOutcome(outcome, record);
    } catch {
      setMessage(
        'This entry could not be saved on this device. Try again, or check that your browser allows this site to save data.',
      );
    } finally {
      setBusy(false);
      activityInFlight.current = false;
    }
  }

  async function handleSyncOutcome(outcome: SyncOutcome, record: PendingDrinkLog) {
    if (outcome.status === 'synced') {
      setDrinkChooser(null);
      setConfirmation(null);
      if (record.kind === 'alcohol' && 'labelSnapshot' in outcome.result.log) {
        setMessage(`${record.memberDisplayName}: ${outcome.result.log.labelSnapshot} logged.`);
        setUndoTarget({
          id: outcome.result.log.id,
          kind: 'alcohol',
          memberId: record.nightMemberId,
          memberName: record.memberDisplayName,
        });
      } else {
        setMessage(`${record.memberDisplayName}: water logged.`);
        setUndoTarget({
          id: outcome.result.log.id,
          kind: 'water',
          memberId: record.nightMemberId,
          memberName: record.memberDisplayName,
        });
      }
      try {
        await refresh();
      } catch {
        setMessage(
          `${record.memberDisplayName}: ${record.kind === 'water' ? 'water' : 'drink'} saved. Refresh to update this night.`,
        );
      }
      return;
    }
    if (outcome.status === 'needs_confirmation') {
      const member = snapshot.members.find((item) => item.id === record.nightMemberId);
      if (member !== undefined && record.kind === 'alcohol') {
        setDrinkChooser(null);
        setConfirmation({
          member,
          ...(record.planItemId === undefined ? {} : { planItemId: record.planItemId }),
          ...(record.drinkSnapshot === undefined ? {} : { drinkSnapshot: record.drinkSnapshot }),
          ...(record.customDrink === undefined ? {} : { customDrink: record.customDrink }),
          consumedAt: record.consumedAt,
          idempotencyKey: record.idempotencyKey,
          pendingKey: record.idempotencyKey,
          warnings: outcome.warnings,
        });
      }
      setMessage('Review this warning before saving the entry.');
      return;
    }
    if (outcome.status === 'skipped') {
      setDrinkChooser(null);
      setConfirmation(null);
      setUndoTarget(null);
      setMessage(
        `${record.memberDisplayName}: ${record.kind === 'water' ? 'water' : 'drink'} saved on this device until you are back online.`,
      );
      return;
    }
    setMessage(outcome.message);
  }

  function logPlanned(member: MemberSnapshot, planItemId: string) {
    void submitDrink({
      member,
      planItemId,
      consumedAt: new Date().toISOString(),
      idempotencyKey: crypto.randomUUID(),
    });
  }

  function quickLog(member: MemberSnapshot) {
    const quick = member.planItems.find((item) => item.isQuickLog) ?? member.planItems[0];
    if (quick === undefined) {
      setPlanMember(member);
      setPlanDraft(draftItemsFromPlan(member.planItems));
      setPlanMode(member.planSetupCompletedAt === null ? 'unselected' : 'water_only');
      return;
    }
    logPlanned(member, quick.id);
  }

  function logCustom(member: MemberSnapshot) {
    void submitDrink({
      member,
      customDrink,
      consumedAt: new Date().toISOString(),
      idempotencyKey: crypto.randomUUID(),
    });
  }

  async function logWater(member: MemberSnapshot) {
    if (activityInFlight.current) return;
    activityInFlight.current = true;
    const consumedAt = new Date().toISOString();
    const record: PendingDrinkLog = {
      idempotencyKey: crypto.randomUUID(),
      kind: 'water',
      actorUserId: snapshot.currentUserId,
      nightId: snapshot.night.id,
      nightMemberId: member.id,
      memberDisplayName: member.displayName,
      consumedAt,
      status: 'pending',
      retryCount: 0,
      acknowledgePlanExceeded: false,
      acknowledgeAfterEnd: false,
      createdLocallyAt: consumedAt,
    };
    setBusy(true);
    try {
      const outcome = await outbox.enqueue(record, online);
      await loadPending();
      await handleSyncOutcome(outcome, record);
    } catch {
      setMessage('This water entry could not be saved on this device.');
    } finally {
      setBusy(false);
      activityInFlight.current = false;
    }
  }

  async function undo(member: MemberSnapshot, explicit: UndoTarget | null = null) {
    if (activityInFlight.current) return;
    activityInFlight.current = true;
    const local = optimisticLogs
      .filter((record) => record.nightMemberId === member.id)
      .sort((a, b) => Date.parse(b.createdLocallyAt) - Date.parse(a.createdLocallyAt))[0];
    if (explicit === null && local !== undefined) {
      setBusy(true);
      let result: Awaited<ReturnType<typeof outbox.undo>>;
      try {
        result = await outbox.undo(local.idempotencyKey);
        await loadPending();
      } catch {
        setMessage('That pending entry could not be changed. Retry when you are online.');
        return;
      } finally {
        setBusy(false);
        activityInFlight.current = false;
      }
      if (result === 'server_deleted') await refresh();
      setMessage(
        result === 'not_found'
          ? `That ${local.kind === 'alcohol' ? 'drink' : 'water'} entry could not be undone.`
          : `${member.displayName}: unsaved ${local.kind === 'alcohol' ? 'drink' : 'water'} entry undone.`,
      );
      return;
    }
    const target = explicit ?? latestActivity(member);
    if (target === null) {
      setMessage(`Nothing recent to undo for ${member.displayName}.`);
      activityInFlight.current = false;
      return;
    }
    setBusy(true);
    let result: Awaited<ReturnType<typeof deleteActivityAction>>;
    try {
      result = await deleteActivityAction({ logId: target.id, kind: target.kind });
    } finally {
      setBusy(false);
      activityInFlight.current = false;
    }
    if (result.ok) {
      setMessage(
        `${member.displayName}: last ${target.kind === 'alcohol' ? 'drink' : 'water'} entry undone.`,
      );
      setUndoTarget(null);
      await refresh();
    } else setMessage(result.error);
  }

  function editPlan(member: MemberSnapshot) {
    setPlanMember(member);
    setPlanDraft(draftItemsFromPlan(member.planItems));
    setPlanMode(
      member.planSetupCompletedAt === null
        ? 'unselected'
        : member.planItems.length === 0
          ? 'water_only'
          : 'drinks',
    );
  }

  async function savePlan() {
    if (planMember === null || planSaveInFlight.current) return;
    const materialized = materializePlanDraft(planMode, planDraft);
    if (!materialized.success) {
      setMessage(materialized.message);
      return;
    }
    planSaveInFlight.current = true;
    setBusy(true);
    try {
      const result = await replacePlanAction({
        memberId: planMember.id,
        items: materialized.data,
        expectedRevision: planMember.planRevision,
      });
      if (result.ok) {
        setSnapshot(result.data);
        setPlanMember(null);
        setMessage(`${planMember.displayName}: plan saved.`);
      } else setMessage(result.error);
    } catch {
      setMessage('This plan could not be saved. Your draft is still here; retry when connected.');
    } finally {
      setBusy(false);
      planSaveInFlight.current = false;
    }
  }

  async function addGuest() {
    if (guestAddInFlight.current) return;
    const materialized = materializePlanDraft(guestPlanMode, guestPlan);
    if (!materialized.success) {
      setMessage(materialized.message);
      return;
    }
    guestAddInFlight.current = true;
    setBusy(true);
    try {
      const result = await addGuestAction({
        nightId: snapshot.night.id,
        guest: { displayName: guestName, planItems: materialized.data },
      });
      if (result.ok) {
        setSnapshot(result.data);
        setGuestOpen(false);
        setGuestName('');
        setGuestPlan([]);
        setGuestPlanMode('unselected');
        setMessage('Guest added.');
      } else setMessage(result.error);
    } finally {
      setBusy(false);
      guestAddInFlight.current = false;
    }
  }

  async function removeGuest() {
    if (guestToRemove === null) return;
    setBusy(true);
    const result = await removeGuestAction({ memberId: guestToRemove.id });
    setBusy(false);
    if (result.ok) {
      setSnapshot(result.data);
      setMessage(
        `${guestToRemove.displayName} was removed. Their past entries are still in the summary.`,
      );
      setGuestToRemove(null);
    } else setMessage(result.error);
  }

  async function extend() {
    setBusy(true);
    const result = await extendNightAction({ nightId: snapshot.night.id, minutes: 30 });
    setBusy(false);
    if (result.ok) {
      setSnapshot(result.data);
      setOverdueDismissedFor(result.data.night.endsAt);
      setMessage('End time extended by 30 minutes.');
    } else setMessage(result.error);
  }

  async function end() {
    setBusy(true);
    try {
      const result = await endNightAction({ nightId: snapshot.night.id });
      if (result.ok) router.replace(`/night/${snapshot.night.id}/summary`);
      else setMessage(result.error);
    } catch {
      setMessage('Couldn’t end the night. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    setBusy(true);
    try {
      const result = await leaveNightAction({ nightId: snapshot.night.id });
      if (result.ok) router.replace('/home');
      else setMessage(result.error);
    } catch {
      setMessage('Couldn’t leave the night. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function retryPending(record: PendingDrinkLog) {
    if (activityInFlight.current) return;
    activityInFlight.current = true;
    setBusy(true);
    try {
      const outcome = await outbox.syncOne(record.idempotencyKey, true);
      await loadPending();
      await handleSyncOutcome(outcome, record);
    } catch {
      setMessage('This entry remains on this device. Retry when you are online.');
    } finally {
      setBusy(false);
      activityInFlight.current = false;
    }
  }

  function reviewPending(record: PendingDrinkLog) {
    const member = snapshot.members.find((item) => item.id === record.nightMemberId);
    if (member === undefined || record.kind !== 'alcohol') return;
    setConfirmation({
      member,
      ...(record.planItemId === undefined ? {} : { planItemId: record.planItemId }),
      ...(record.drinkSnapshot === undefined ? {} : { drinkSnapshot: record.drinkSnapshot }),
      ...(record.customDrink === undefined ? {} : { customDrink: record.customDrink }),
      consumedAt: record.consumedAt,
      idempotencyKey: record.idempotencyKey,
      pendingKey: record.idempotencyKey,
      warnings: record.requiredWarnings ?? [],
    });
  }

  async function removePending(record: PendingDrinkLog) {
    await outbox.remove(record.idempotencyKey);
    await loadPending();
    setMessage('Unsaved entry removed from this device.');
  }

  async function checkIn(member: MemberSnapshot) {
    if (member.id === snapshot.currentMemberId || member.leftAt !== null) return;
    if (!online) {
      setMessage('Check-in needs a live connection. Try again when you are online.');
      return;
    }
    if (checkInInFlight.current.has(member.id)) return;
    checkInInFlight.current.add(member.id);
    setCheckInStates((current) => ({ ...current, [member.id]: 'sending' }));
    try {
      const requestKey = checkInKeys.current.get(member.id) ?? crypto.randomUUID();
      checkInKeys.current.set(member.id, requestKey);
      const result = await sendCheckInAction({
        nightId: snapshot.night.id,
        targetMemberId: member.id,
        requestKey,
      });
      if (!result.ok) {
        setCheckInStates((current) => ({ ...current, [member.id]: 'error' }));
        setMessage(result.error);
      } else if (result.data.status === 'cooldown') {
        setCheckInStates((current) => ({ ...current, [member.id]: 'error' }));
        setMessage(result.data.message);
      } else {
        setCheckInStates((current) => ({ ...current, [member.id]: 'sent' }));
        setMessage(result.data.message || `Check-in sent to ${member.displayName}.`);
        checkInKeys.current.delete(member.id);
      }
    } catch {
      setCheckInStates((current) => ({ ...current, [member.id]: 'error' }));
      setMessage('Check-in could not be sent. Retry when connected.');
    } finally {
      checkInInFlight.current.delete(member.id);
    }
  }

  return (
    <NightFrame
      snapshot={snapshot}
      segment={segment}
      onSegment={setSegment}
      onHelp={() => setEmergencyOpen(true)}
      connection={realtimeStatus}
      remainingText={remainingText}
      overdue={timeStatus === 'overdue'}
    >
      <NotificationInbox key={snapshot.currentUserId} nightId={snapshot.night.id} />
      {segment === 'tonight' ? (
        <TonightView
          member={currentMember}
          alerts={snapshot.alerts.filter((alert) => alert.nightMemberId === currentMember.id)}
          busy={busy}
          onQuick={() => quickLog(currentMember)}
          onChoose={() => setDrinkChooser(currentMember)}
          onWater={() => void logWater(currentMember)}
          onUndo={() => void undo(currentMember)}
          pendingLogs={optimisticLogs.filter((record) => record.nightMemberId === currentMember.id)}
        />
      ) : null}

      {segment === 'group' ? (
        <section className="stack">
          <header>
            <h2>Your people</h2>
          </header>
          {snapshot.members.map((member) => {
            const managed =
              member.memberType === 'guest' && member.managedByUserId === snapshot.currentUserId;
            return (
              <ParticipantCard
                key={member.id}
                member={member}
                alerts={snapshot.alerts.filter((alert) => alert.nightMemberId === member.id)}
                managed={managed}
                busy={busy}
                onQuick={() => quickLog(member)}
                onChoose={() => setDrinkChooser(member)}
                onWater={() => void logWater(member)}
                onUndo={() => void undo(member)}
                onEditPlan={() => editPlan(member)}
                onRemove={() => setGuestToRemove(member)}
                pendingLogs={optimisticLogs.filter((record) => record.nightMemberId === member.id)}
                canCheckIn={
                  member.userId !== snapshot.currentUserId &&
                  member.managedByUserId !== snapshot.currentUserId &&
                  member.leftAt === null
                }
                checkInLabel={member.memberType === 'guest' ? 'Ask host to check in' : 'Check in'}
                checkInState={checkInStates[member.id] ?? 'idle'}
                onCheckIn={() => void checkIn(member)}
                guestNote={
                  member.memberType === 'guest'
                    ? member.managedByUserId === snapshot.currentUserId
                      ? 'Managed guest: check in with them directly on this device.'
                      : 'Ask the host to check in.'
                    : undefined
                }
              />
            );
          })}
        </section>
      ) : null}

      {segment === 'more' ? (
        <section className="stack">
          <header>
            <h2>Night controls</h2>
          </header>
          {isHost && (
            <p className="muted small">
              Invite someone: they use their own account and phone. Track for someone: you manage
              their entries on your phone.
            </p>
          )}
          <Card className="action-list">
            <button type="button" onClick={() => editPlan(currentMember)}>
              <Pencil aria-hidden="true" /> Edit my plan
            </button>
            <button type="button" onClick={() => editPlan(currentMember)}>
              <ChevronDown aria-hidden="true" /> Change my usual drink
            </button>
            {isHost ? (
              <button type="button" onClick={() => setInviteOpen(true)}>
                <Share2 aria-hidden="true" /> Invite someone
              </button>
            ) : null}
            {isHost ? (
              <button type="button" onClick={() => setGuestOpen(true)}>
                <UserPlus aria-hidden="true" /> Track for someone
              </button>
            ) : null}
            {isHost ? (
              <button type="button" disabled={busy} onClick={() => void extend()}>
                <Clock3 aria-hidden="true" /> Extend by 30 minutes
              </button>
            ) : null}
            <Link href="/account#notifications">
              <Bell aria-hidden="true" /> Notification settings
            </Link>
          </Card>
          <PendingQueuePanel
            records={optimisticLogs}
            busy={busy}
            onRetry={(record) => void retryPending(record)}
            onReview={reviewPending}
            onRemove={(record) => void removePending(record)}
          />
          {isHost ? (
            <Button
              type="button"
              variant="danger"
              full
              disabled={busy}
              onClick={() => setEndOpen(true)}
            >
              End night and view summary
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              full
              disabled={busy}
              onClick={() => setLeaveOpen(true)}
            >
              <LogOut aria-hidden="true" size={20} /> Leave night
            </Button>
          )}
        </section>
      ) : null}

      {message === null ? null : (
        <div className="toast" role="status">
          <span>{message}</span>
          {undoTarget === null ? null : (
            <button
              type="button"
              onClick={() => {
                const member = snapshot.members.find((item) => item.id === undoTarget.memberId);
                if (member !== undefined) void undo(member, undoTarget);
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}

      <DrinkChooser
        member={drinkChooser}
        customDrink={customDrink}
        setCustomDrink={setCustomDrink}
        busy={busy}
        onClose={() => setDrinkChooser(null)}
        onPlanned={(member, id) => logPlanned(member, id)}
        onCustom={logCustom}
      />
      <ConfirmationDialog
        draft={confirmation}
        busy={busy}
        onClose={() => {
          if (!busy) setConfirmation(null);
        }}
        onConfirm={(draft) => void submitDrink(draft, true)}
      />
      <PlanDialog
        member={planMember}
        items={planDraft}
        setItems={setPlanDraft}
        mode={planMode}
        setMode={setPlanMode}
        busy={busy}
        onClose={() => {
          if (!busy) setPlanMember(null);
        }}
        onSave={() => void savePlan()}
      />
      <GuestDialog
        open={guestOpen}
        name={guestName}
        setName={setGuestName}
        plan={guestPlan}
        setPlan={setGuestPlan}
        mode={guestPlanMode}
        setMode={setGuestPlanMode}
        busy={busy}
        onClose={() => {
          if (!busy) setGuestOpen(false);
        }}
        onSave={() => void addGuest()}
      />
      <GuestRemovalDialog
        guest={guestToRemove}
        busy={busy}
        onClose={() => {
          if (!busy) setGuestToRemove(null);
        }}
        onRemove={() => void removeGuest()}
      />
      <ShareInviteDialog
        currentUserId={snapshot.currentUserId}
        nightId={snapshot.night.id}
        nightTitle={snapshot.night.title}
        open={inviteOpen}
        initialUrl={inviteUrl}
        onClose={() => setInviteOpen(false)}
      />
      <EmergencyPanel open={emergencyOpen} onClose={() => setEmergencyOpen(false)} />
      <OverdueDialog
        open={overdueOpen}
        isHost={isHost}
        busy={busy}
        onContinue={() => setOverdueDismissedFor(snapshot.night.endsAt)}
        onExtend={() => void extend()}
        onEnd={() => setEndOpen(true)}
        onLeave={() => setLeaveOpen(true)}
      />
      <Dialog
        open={endOpen}
        title="End this night?"
        description="This ends the night for everyone and can’t be undone. Your group’s summary will be saved."
        onClose={() => {
          if (!busy) setEndOpen(false);
        }}
      >
        {optimisticLogs.length > 0 ? (
          <div className="warning-box">
            You have entries waiting to save. Keep this device online to save them.
          </div>
        ) : null}
        <div className="row">
          <Button
            type="button"
            variant="secondary"
            full
            disabled={busy}
            onClick={() => setEndOpen(false)}
          >
            Keep tracking
          </Button>
          <Button type="button" variant="danger" full disabled={busy} onClick={() => void end()}>
            {busy ? 'Ending…' : 'End night'}
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={leaveOpen}
        title="Leave this night?"
        description="Your entries stay in the group’s record. Use an active invitation to rejoin."
        onClose={() => {
          if (!busy) setLeaveOpen(false);
        }}
      >
        <div className="row">
          <Button
            type="button"
            variant="secondary"
            full
            disabled={busy}
            onClick={() => setLeaveOpen(false)}
          >
            Stay
          </Button>
          <Button type="button" variant="danger" full disabled={busy} onClick={() => void leave()}>
            {busy ? 'Leaving…' : 'Leave night'}
          </Button>
        </div>
      </Dialog>
    </NightFrame>
  );
}

function PendingQueuePanel({
  records,
  busy,
  onRetry,
  onReview,
  onRemove,
}: {
  records: readonly PendingDrinkLog[];
  busy: boolean;
  onRetry: (record: PendingDrinkLog) => void;
  onReview: (record: PendingDrinkLog) => void;
  onRemove: (record: PendingDrinkLog) => void;
}) {
  if (records.length === 0) return null;
  return (
    <Card className="stack">
      <div>
        <Eyebrow>On this device</Eyebrow>
        <h3>Pending entries</h3>
      </div>
      {records.map((record) => (
        <div className="pending-entry stack" key={record.idempotencyKey}>
          <div className="row-between">
            <span>
              {record.memberDisplayName} ·{' '}
              {record.kind === 'water'
                ? 'Water'
                : (record.planItemLabel ?? record.drinkSnapshot?.label ?? 'Drink')}
            </span>
            <span
              className={`pill${record.status === 'permanent_failure' || record.status === 'needs_confirmation' ? ' pill-warning' : ''}`}
            >
              {pendingStatusLabel(record.status)}
            </span>
          </div>
          {record.lastError === undefined ? null : (
            <p className="muted small">{record.lastError}</p>
          )}
          <div className="row">
            {record.status === 'needs_confirmation' ? (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => onReview(record)}
              >
                Review
              </Button>
            ) : null}
            {record.status === 'failed' ? (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => onRetry(record)}
              >
                Retry
              </Button>
            ) : null}
            <Button type="button" variant="ghost" disabled={busy} onClick={() => onRemove(record)}>
              Remove
            </Button>
          </div>
        </div>
      ))}
    </Card>
  );
}

function ConfirmationDialog({
  draft,
  busy,
  onClose,
  onConfirm,
}: {
  draft: DrinkDraft | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (draft: DrinkDraft) => void;
}) {
  const warnings = draft?.warnings ?? [];
  return (
    <Dialog
      open={draft !== null}
      title="Confirm this log"
      description={draft === null ? undefined : `Logging for ${draft.member.displayName}.`}
      onClose={onClose}
    >
      {warnings.includes('plan_exceeded') ? (
        <div className="warning-box">This is beyond the plan you set earlier.</div>
      ) : null}
      {warnings.includes('after_end') ? (
        <div className="warning-box">Your planned night has ended.</div>
      ) : null}
      <div className="row">
        <Button type="button" variant="secondary" full onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          full
          disabled={busy || draft === null}
          onClick={() => {
            if (draft !== null) onConfirm(draft);
          }}
        >
          Log anyway
        </Button>
      </div>
    </Dialog>
  );
}

function PlanDialog({
  member,
  items,
  setItems,
  mode,
  setMode,
  busy,
  onClose,
  onSave,
}: {
  member: MemberSnapshot | null;
  items: PlanDraftItem[];
  setItems: (items: PlanDraftItem[]) => void;
  mode: PlanSetupMode;
  setMode: (mode: PlanSetupMode) => void;
  busy: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Dialog
      open={member !== null}
      title={member === null ? 'Your plan' : `${member.displayName}'s plan`}
      description="Changes apply to future entries."
      onClose={onClose}
    >
      <PlanEditor items={items} mode={mode} onModeChange={setMode} onChange={setItems} />
      <Button type="button" full disabled={busy} onClick={onSave}>
        {busy ? 'Saving…' : 'Save plan'}
      </Button>
    </Dialog>
  );
}

function GuestDialog({
  open,
  name,
  setName,
  plan,
  setPlan,
  mode,
  setMode,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  name: string;
  setName: (name: string) => void;
  plan: PlanDraftItem[];
  setPlan: (plan: PlanDraftItem[]) => void;
  mode: PlanSetupMode;
  setMode: (mode: PlanSetupMode) => void;
  busy: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Dialog
      open={open}
      title="Track for someone"
      description="You manage their plan and entries on your phone. They do not need an account. Ask them before adding them."
      onClose={onClose}
    >
      <div className="field">
        <label htmlFor="new-guest-name">Display name</label>
        <input
          id="new-guest-name"
          className="input"
          maxLength={60}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <PlanEditor compact items={plan} mode={mode} onModeChange={setMode} onChange={setPlan} />
      <Button type="button" full disabled={busy} onClick={onSave}>
        {busy ? 'Adding…' : 'Track for someone'}
      </Button>
    </Dialog>
  );
}

function GuestRemovalDialog({
  guest,
  busy,
  onClose,
  onRemove,
}: {
  guest: MemberSnapshot | null;
  busy: boolean;
  onClose: () => void;
  onRemove: () => void;
}) {
  return (
    <Dialog
      open={guest !== null}
      title={guest === null ? 'Remove guest' : `Remove ${guest.displayName}?`}
      description="You will no longer be able to add drinks for them. Their past entries stay in the summary."
      onClose={onClose}
    >
      <div className="row">
        <Button type="button" variant="secondary" full onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" variant="danger" full disabled={busy} onClick={onRemove}>
          {busy ? 'Removing…' : 'Remove guest'}
        </Button>
      </div>
    </Dialog>
  );
}

function OverdueDialog({
  open,
  isHost,
  busy,
  onContinue,
  onExtend,
  onEnd,
  onLeave,
}: {
  open: boolean;
  isHost: boolean;
  busy: boolean;
  onContinue: () => void;
  onExtend: () => void;
  onEnd: () => void;
  onLeave: () => void;
}) {
  return (
    <Dialog
      open={open}
      title="Your planned night has ended."
      description="The shared night remains active until the host ends it. Alcohol logs now require confirmation."
      onClose={onContinue}
    >
      {isHost ? (
        <Button type="button" variant="danger" full disabled={busy} onClick={onEnd}>
          End night and view summary
        </Button>
      ) : null}
      {isHost ? (
        <Button type="button" variant="secondary" full disabled={busy} onClick={onExtend}>
          Extend by 30 minutes
        </Button>
      ) : null}
      <Button type="button" full onClick={onContinue}>
        Continue tracking without extending
      </Button>
      {isHost ? null : (
        <Button type="button" variant="secondary" full disabled={busy} onClick={onLeave}>
          Leave night
        </Button>
      )}
    </Dialog>
  );
}

function latestActivity(member: MemberSnapshot): UndoTarget | null {
  const entries: Array<{ id: string; kind: ActivityKind; createdAt: string }> = [
    ...member.drinkLogs.map((log) => ({
      id: log.id,
      kind: 'alcohol' as const,
      createdAt: log.createdAt,
    })),
    ...member.waterLogs.map((log) => ({
      id: log.id,
      kind: 'water' as const,
      createdAt: log.createdAt,
    })),
  ];
  const latest = entries.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  return latest === undefined
    ? null
    : { id: latest.id, kind: latest.kind, memberId: member.id, memberName: member.displayName };
}

function formatRemaining(endsAt: string, now: Date): string {
  const minutes = Math.max(0, Math.ceil((Date.parse(endsAt) - now.getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min remaining`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min remaining`;
}

function pendingStatusLabel(status: PendingDrinkLog['status']): string {
  if (status === 'needs_confirmation') return 'Review needed';
  if (status === 'permanent_failure') return 'Could not save';
  if (status === 'failed') return 'Retry available';
  if (status === 'syncing') return 'Saving';
  return 'Waiting';
}
