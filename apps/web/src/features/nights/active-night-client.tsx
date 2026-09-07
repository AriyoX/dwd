'use client';

import {
  BellRing,
  ChevronDown,
  Clock3,
  Droplets,
  HeartHandshake,
  Moon,
  Settings2,
  Users,
  LogOut,
  Pencil,
  Plus,
  Share2,
  Undo2,
  UserPlus,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  calculateEthanolGrams,
  calculateMemberTotals,
  calculatePlanTotal,
  determineNightTimeStatus,
  determinePlanStatus,
  projectedPlanStatus,
  requiredLogConfirmations,
  type CustomDrinkInput,
  type DrinkCategory,
  type MemberSnapshot,
  type NightSnapshot,
  type PlanItemInput,
} from '@dwd/core';
import type { PendingDrinkLog } from '@dwd/contracts';
import { Button } from '@/components/ui/button';
import { Card, Eyebrow } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Wordmark } from '@/components/layout/wordmark';
import { EmergencyPanel } from '@/features/alerts/emergency-panel';
import { deleteActivityAction } from '@/features/drink-logging/actions';
import { ShareInviteDialog } from '@/features/invites/share-invite-dialog';
import { createBrowserOutbox, type BrowserOutboxBundle } from '@/features/offline/browser-outbox';
import type { SyncOutcome } from '@/features/offline/outbox';
import { PlanEditor, newPlanItem } from '@/features/plans/plan-editor';
import { BrowserNotificationService } from '@/adapters/notifications.browser';
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
    const result = await getNightSnapshotAction(snapshot.night.id);
    if (!result.ok) return;
    setSnapshot(result.data);
    if (result.data.night.status === 'ended') {
      router.replace(`/night/${result.data.night.id}/summary`);
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
  const [notificationService] = useState(() => new BrowserNotificationService());
  const notifiedEndRef = useRef<string | null>(null);
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
    setupPlanInitially ? currentMember : null,
  );
  const [planDraft, setPlanDraft] = useState<PlanItemInput[]>(() => currentMember.planItems);
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestToRemove, setGuestToRemove] = useState<MemberSnapshot | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestPlan, setGuestPlan] = useState<PlanItemInput[]>(() => [newPlanItem()]);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [overdueDismissedFor, setOverdueDismissedFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [undoTarget, setUndoTarget] = useState<UndoTarget | null>(null);
  const [pendingLogs, setPendingLogs] = useState<PendingDrinkLog[]>([]);
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
    window.history.replaceState({}, '', `/night/${snapshot.night.id}`);
  }, [isHost, openInviteInitially, snapshot.night.id]);

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
    void synchronize();
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

  useEffect(() => {
    if (timeStatus !== 'overdue' || notifiedEndRef.current === snapshot.night.endsAt) return;
    notifiedEndRef.current = snapshot.night.endsAt;
    notificationService.vibrate();
    void notificationService.show({
      title: 'Your planned night has ended',
      body: 'DWD is still open. Continue tracking, or ask the host to extend or end the night.',
      tag: `dwd-end-${snapshot.night.id}`,
    });
  }, [notificationService, snapshot.night.endsAt, snapshot.night.id, timeStatus]);

  async function submitDrink(draft: DrinkDraft, acknowledge = false) {
    const planItem =
      draft.planItemId === undefined
        ? undefined
        : draft.member.planItems.find((item) => item.id === draft.planItemId);
    const drinkValues = draft.customDrink ?? planItem ?? draft.drinkSnapshot;
    if (drinkValues === undefined) {
      setMessage('That plan item is no longer available. Choose another drink.');
      return;
    }

    const previewWarnings = requiredLogConfirmations(
      projectedPlanStatus(
        draft.member.drinkLogs,
        draft.member.planItems,
        calculateEthanolGrams(drinkValues.volumeMl, drinkValues.abvPercent),
      ),
      Date.parse(draft.consumedAt) > Date.parse(snapshot.night.endsAt),
    );
    const warnings = [...new Set([...(draft.warnings ?? []), ...previewWarnings])];
    if (!acknowledge && warnings.length > 0) {
      setDrinkChooser(null);
      setConfirmation({ ...draft, warnings });
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
        'This entry could not be saved on this device. Check browser storage and try again.',
      );
    } finally {
      setBusy(false);
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
      await refresh();
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
          warnings: outcome.warnings,
        });
      }
      setMessage('Review the new server warning before this entry can sync.');
      return;
    }
    if (outcome.status === 'skipped') {
      setDrinkChooser(null);
      setConfirmation(null);
      setUndoTarget(null);
      setMessage(
        `${record.memberDisplayName}: ${record.kind === 'water' ? 'water' : 'drink'} queued offline.`,
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
      setPlanDraft([newPlanItem()]);
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
    }
  }

  async function undo(member: MemberSnapshot, explicit: UndoTarget | null = null) {
    const local = optimisticLogs
      .filter((record) => record.nightMemberId === member.id)
      .sort((a, b) => Date.parse(b.createdLocallyAt) - Date.parse(a.createdLocallyAt))[0];
    if (explicit === null && local !== undefined) {
      setBusy(true);
      const result = await outbox.undo(local.idempotencyKey);
      await loadPending();
      setBusy(false);
      if (result === 'server_deleted') await refresh();
      setMessage(
        result === 'not_found'
          ? `That ${local.kind === 'alcohol' ? 'drink' : 'water'} entry could not be undone.`
          : `${member.displayName}: queued ${local.kind === 'alcohol' ? 'drink' : 'water'} entry undone.`,
      );
      return;
    }
    const target = explicit ?? latestActivity(member);
    if (target === null) {
      setMessage(`Nothing recent to undo for ${member.displayName}.`);
      return;
    }
    setBusy(true);
    const result = await deleteActivityAction({ logId: target.id, kind: target.kind });
    setBusy(false);
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
    setPlanDraft(member.planItems);
  }

  async function savePlan() {
    if (planMember === null) return;
    setBusy(true);
    const result = await replacePlanAction({ memberId: planMember.id, items: planDraft });
    setBusy(false);
    if (result.ok) {
      setSnapshot(result.data);
      setPlanMember(null);
      setMessage(`${planMember.displayName}: plan saved.`);
    } else setMessage(result.error);
  }

  async function addGuest() {
    setBusy(true);
    const result = await addGuestAction({
      nightId: snapshot.night.id,
      guest: { displayName: guestName, planItems: guestPlan },
    });
    setBusy(false);
    if (result.ok) {
      setSnapshot(result.data);
      setGuestOpen(false);
      setGuestName('');
      setGuestPlan([newPlanItem()]);
      setMessage('Managed guest added.');
    } else setMessage(result.error);
  }

  async function removeGuest() {
    if (guestToRemove === null) return;
    setBusy(true);
    const result = await removeGuestAction({ memberId: guestToRemove.id });
    setBusy(false);
    if (result.ok) {
      setSnapshot(result.data);
      setMessage(`${guestToRemove.displayName} was removed. Historical entries were preserved.`);
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
      setMessage('Planned end extended by 30 minutes. Earlier logs were not reclassified.');
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
    setBusy(true);
    const outcome = await outbox.syncOne(record.idempotencyKey, true);
    await loadPending();
    await handleSyncOutcome(outcome, record);
    setBusy(false);
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
      warnings: record.requiredWarnings ?? [],
    });
  }

  async function removePending(record: PendingDrinkLog) {
    await outbox.remove(record.idempotencyKey);
    await loadPending();
    setMessage('Queued entry removed from this device.');
  }

  async function enableBrowserAlert() {
    const permission = await notificationService.requestPermission();
    if (permission === 'granted')
      setMessage('Browser end alert enabled while browser support allows it.');
    else if (permission === 'unsupported')
      setMessage('Browser notifications are unavailable here. The in-app alert remains active.');
    else setMessage('Notification permission was not granted. The in-app alert remains active.');
  }

  return (
    <main className="page-shell active-night-shell" id="main-content">
      <header className="night-header">
        <div className="row-between">
          <Wordmark />
          <span
            className={`pill${realtimeStatus === 'connected' ? ' pill-online' : realtimeStatus === 'offline' ? ' pill-warning' : ''}`}
          >
            {realtimeStatus === 'connected'
              ? 'Connected'
              : realtimeStatus === 'offline'
                ? 'Offline'
                : 'Reconnecting'}
          </span>
        </div>
        <div>
          <p className="eyebrow">
            {timeStatus === 'overdue' ? 'Planned time ended' : remainingText}
          </p>
          <h1>{snapshot.night.title}</h1>
        </div>
        <div className="avatar-row" aria-label={`${snapshot.members.length} participants`}>
          {snapshot.members.slice(0, 8).map((member) => (
            <span className="avatar" title={member.displayName} key={member.id}>
              {initials(member.displayName)}
            </span>
          ))}
        </div>
      </header>

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
              <ChevronDown aria-hidden="true" /> Change my quick-log drink
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
            <button type="button" onClick={() => void enableBrowserAlert()}>
              <BellRing aria-hidden="true" /> Enable browser end alert
            </button>
          </Card>
          <p className="muted small">
            The live countdown and in-app alert work while this page is open. A normal browser
            notification is not reliable after the browser is fully closed.
          </p>
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

      <Button type="button" variant="danger" full onClick={() => setEmergencyOpen(true)}>
        <HeartHandshake aria-hidden="true" size={21} /> Someone needs help
      </Button>

      <nav className="segment-nav" aria-label="Night views">
        <button
          className={segment === 'tonight' ? 'active' : ''}
          aria-pressed={segment === 'tonight'}
          type="button"
          onClick={() => setSegment('tonight')}
        >
          <Moon aria-hidden="true" size={19} /> Tonight
        </button>
        <button
          className={segment === 'group' ? 'active' : ''}
          aria-pressed={segment === 'group'}
          type="button"
          onClick={() => setSegment('group')}
        >
          <Users aria-hidden="true" size={19} /> Group
        </button>
        <button
          className={segment === 'more' ? 'active' : ''}
          aria-pressed={segment === 'more'}
          type="button"
          onClick={() => setSegment('more')}
        >
          <Settings2 aria-hidden="true" size={19} /> Manage
        </button>
      </nav>

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
        onClose={() => setConfirmation(null)}
        onConfirm={(draft) => void submitDrink(draft, true)}
      />
      <PlanDialog
        member={planMember}
        items={planDraft}
        setItems={setPlanDraft}
        busy={busy}
        onClose={() => setPlanMember(null)}
        onSave={() => void savePlan()}
      />
      <GuestDialog
        open={guestOpen}
        name={guestName}
        setName={setGuestName}
        plan={guestPlan}
        setPlan={setGuestPlan}
        busy={busy}
        onClose={() => setGuestOpen(false)}
        onSave={() => void addGuest()}
      />
      <GuestRemovalDialog
        guest={guestToRemove}
        busy={busy}
        onClose={() => setGuestToRemove(null)}
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
            You have entries waiting to sync. Keep this device online to save them.
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
    </main>
  );
}

function TonightView({
  member,
  alerts,
  busy,
  onQuick,
  onChoose,
  onWater,
  onUndo,
  pendingLogs,
}: {
  member: MemberSnapshot;
  alerts: NightSnapshot['alerts'];
  busy: boolean;
  onQuick: () => void;
  onChoose: () => void;
  onWater: () => void;
  onUndo: () => void;
  pendingLogs: readonly PendingDrinkLog[];
}) {
  const totals = calculateMemberTotals(member.drinkLogs, member.waterLogs);
  const pendingAlcohol = pendingLogs.filter((record) => record.kind === 'alcohol').length;
  const pendingWater = pendingLogs.filter((record) => record.kind === 'water').length;
  const planTotal = member.planItems.length === 0 ? 0 : calculatePlanTotal(member.planItems);
  const planStatus =
    planTotal === 0 ? 'within_plan' : determinePlanStatus(totals.ethanolGrams, planTotal);
  const quick = member.planItems.find((item) => item.isQuickLog) ?? member.planItems[0];
  return (
    <section className="stack">
      {alerts.map((alert) => (
        <div className="warning-box row" key={alert.id}>
          <BellRing aria-hidden="true" size={20} />
          <span>{alert.message}</span>
        </div>
      ))}
      <Card className="personal-card stack-lg">
        <div className="row-between">
          <div>
            <h2>{member.displayName}</h2>
          </div>
          <span className={`pill${planStatus !== 'within_plan' ? ' pill-warning' : ''}`}>
            {member.planItems.length === 0 ? 'Water only' : planStatus.replace('_', ' ')}
          </span>
        </div>
        <div>
          <strong className="big-count">{totals.alcoholCount + pendingAlcohol}</strong>
          <span className="muted"> drinks logged</span>
          <p className="muted small">
            {formatCategories(totals.categoryCounts)} · approximately{' '}
            {totals.ethanolGrams.toFixed(1)} g pure alcohol (
            {totals.standardDrinkEquivalent.toFixed(1)} standard-drink equivalents)
          </p>
          {pendingAlcohol + pendingWater === 0 ? null : (
            <p className="pill pill-warning">{pendingAlcohol + pendingWater} waiting to sync</p>
          )}
        </div>
        <div className="plan-summary">
          <span>
            Your plan · {totals.waterCount + pendingWater}{' '}
            {totals.waterCount + pendingWater === 1 ? 'water entry' : 'water entries'}
          </span>
          <strong>
            {member.planItems
              .map((item) => `${item.plannedQuantity} ${item.label.toLowerCase()}`)
              .join(' · ') || 'Water only'}
          </strong>
        </div>
        <Button type="button" full disabled={busy} onClick={onQuick}>
          <Plus aria-hidden="true" size={26} />{' '}
          {quick === undefined ? 'Add an alcohol plan' : `Log ${quick.label}`}
        </Button>
        <div className="quick-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={busy || member.planItems.length === 0}
            onClick={onChoose}
          >
            Choose another drink
          </Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={onWater}>
            <Droplets aria-hidden="true" size={19} /> Water
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={onUndo}>
            <Undo2 aria-hidden="true" size={19} /> Undo
          </Button>
        </div>
      </Card>
    </section>
  );
}

function ParticipantCard({
  member,
  alerts,
  managed,
  busy,
  onQuick,
  onChoose,
  onWater,
  onUndo,
  onEditPlan,
  onRemove,
  pendingLogs,
}: {
  member: MemberSnapshot;
  alerts: NightSnapshot['alerts'];
  managed: boolean;
  busy: boolean;
  onQuick: () => void;
  onChoose: () => void;
  onWater: () => void;
  onUndo: () => void;
  onEditPlan: () => void;
  onRemove: () => void;
  pendingLogs: readonly PendingDrinkLog[];
}) {
  const totals = calculateMemberTotals(member.drinkLogs, member.waterLogs);
  const pendingAlcohol = pendingLogs.filter((record) => record.kind === 'alcohol').length;
  const planned = member.planItems.reduce((sum, item) => sum + item.plannedQuantity, 0);
  const quick = member.planItems.find((item) => item.isQuickLog) ?? member.planItems[0];
  const lastActivity = [...member.drinkLogs, ...member.waterLogs].sort(
    (a, b) => Date.parse(b.consumedAt) - Date.parse(a.consumedAt),
  )[0];
  return (
    <Card className="stack">
      <div className="row-between">
        <div className="row">
          <span className="avatar">{initials(member.displayName)}</span>
          <div>
            <strong>{member.displayName}</strong>
            <p className="muted small">
              {member.memberType === 'guest' ? 'Managed guest' : 'Account participant'}
              {member.leftAt === null ? '' : ' · left'}
            </p>
          </div>
        </div>
        {alerts.length === 0 ? null : <span className="pill pill-warning">Check in</span>}
      </div>
      <div className="row-between">
        <span>
          {totals.alcoholCount + pendingAlcohol} logged · Plan {planned}
          {pendingLogs.length === 0 ? '' : ` · ${pendingLogs.length} syncing`}
        </span>
        {lastActivity === undefined ? null : (
          <span className="muted small">{relativeTime(lastActivity.consumedAt)}</span>
        )}
      </div>
      {alerts.map((alert) => (
        <div className="warning-box small" key={alert.id}>
          {alert.message}
        </div>
      ))}
      {managed && member.leftAt === null ? (
        <div className="guest-controls stack">
          <Button type="button" full disabled={busy} onClick={onQuick}>
            <Plus aria-hidden="true" size={20} />{' '}
            {quick === undefined
              ? `Set ${member.displayName}'s plan`
              : `Log ${quick.label} for ${member.displayName}`}
          </Button>
          <div className="quick-actions">
            <Button
              type="button"
              variant="secondary"
              disabled={busy || member.planItems.length === 0}
              onClick={onChoose}
            >
              Another for {member.displayName}
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={onWater}>
              <Droplets aria-hidden="true" size={18} /> Water
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={onUndo}>
              <Undo2 aria-hidden="true" size={18} /> Undo
            </Button>
          </div>
          <Button type="button" variant="ghost" onClick={onEditPlan}>
            <Pencil aria-hidden="true" size={18} /> Edit {member.displayName}&apos;s plan
          </Button>
          <Button type="button" variant="danger" onClick={onRemove}>
            Remove {member.displayName}
          </Button>
        </div>
      ) : null}
    </Card>
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

function DrinkChooser({
  member,
  customDrink,
  setCustomDrink,
  busy,
  onClose,
  onPlanned,
  onCustom,
}: {
  member: MemberSnapshot | null;
  customDrink: CustomDrinkInput;
  setCustomDrink: (drink: CustomDrinkInput) => void;
  busy: boolean;
  onClose: () => void;
  onPlanned: (member: MemberSnapshot, id: string) => void;
  onCustom: (member: MemberSnapshot) => void;
}) {
  return (
    <Dialog
      open={member !== null}
      title={member === null ? 'Choose a drink' : `Log for ${member.displayName}`}
      onClose={onClose}
    >
      {member?.planItems.map((item) => (
        <Button
          type="button"
          variant="secondary"
          full
          disabled={busy}
          key={item.id}
          onClick={() => onPlanned(member, item.id)}
        >
          {item.label} · {item.volumeMl} ml · {item.abvPercent}%
        </Button>
      ))}
      <hr className="divider" />
      <h3>Custom drink</h3>
      <div className="field-grid">
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="custom-label">Label</label>
          <input
            id="custom-label"
            className="input"
            maxLength={60}
            value={customDrink.label}
            onChange={(event) => setCustomDrink({ ...customDrink, label: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="custom-category">Category</label>
          <select
            id="custom-category"
            className="select"
            value={customDrink.category}
            onChange={(event) =>
              setCustomDrink({ ...customDrink, category: event.target.value as DrinkCategory })
            }
          >
            <option value="beer">Beer</option>
            <option value="wine">Wine</option>
            <option value="spirit">Spirit</option>
            <option value="cocktail">Cocktail</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="custom-volume">Volume ml</label>
          <input
            id="custom-volume"
            className="input"
            type="number"
            value={customDrink.volumeMl}
            onChange={(event) =>
              setCustomDrink({ ...customDrink, volumeMl: Number(event.target.value) })
            }
          />
        </div>
        <div className="field">
          <label htmlFor="custom-abv">ABV %</label>
          <input
            id="custom-abv"
            className="input"
            type="number"
            value={customDrink.abvPercent}
            onChange={(event) =>
              setCustomDrink({ ...customDrink, abvPercent: Number(event.target.value) })
            }
          />
        </div>
      </div>
      <Button
        type="button"
        full
        disabled={member === null || busy}
        onClick={() => {
          if (member !== null) onCustom(member);
        }}
      >
        Log custom drink
      </Button>
    </Dialog>
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
  busy,
  onClose,
  onSave,
}: {
  member: MemberSnapshot | null;
  items: PlanItemInput[];
  setItems: (items: PlanItemInput[]) => void;
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
      <PlanEditor items={items} onChange={setItems} />
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
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  name: string;
  setName: (name: string) => void;
  plan: PlanItemInput[];
  setPlan: (plan: PlanItemInput[]) => void;
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
      <PlanEditor compact items={plan} onChange={setPlan} />
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
      title={guest === null ? 'Remove managed guest' : `Remove ${guest.displayName}?`}
      description="They will become read-only. Their historical logs and summary remain available."
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

function formatCategories(categories: Record<string, number | undefined>): string {
  const entries = Object.entries(categories).filter(
    (entry): entry is [string, number] => entry[1] !== undefined,
  );
  if (entries.length === 0) return 'No alcohol logged';
  return entries
    .map(([category, count]) => `${count} ${category}${count === 1 ? '' : 's'}`)
    .join(' · ');
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function relativeTime(value: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 60_000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function pendingStatusLabel(status: PendingDrinkLog['status']): string {
  if (status === 'needs_confirmation') return 'Review needed';
  if (status === 'permanent_failure') return 'Cannot sync';
  if (status === 'failed') return 'Retry available';
  if (status === 'syncing') return 'Syncing';
  return 'Waiting';
}
