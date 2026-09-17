'use client';

import { BellRing, Droplets, Pencil, Plus, Undo2 } from 'lucide-react';
import {
  buildDrinkBreakdown,
  calculateMemberTotals,
  calculatePlanTotal,
  determinePlanStatus,
  type MemberSnapshot,
  type NightSnapshot,
  calculatePlanPacing,
  type Night,
} from '@dwd/core';
import type { PendingDrinkLog } from '@dwd/contracts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TimedNotice } from '@/components/feedback/timed-notice';
import { withPendingDrinks } from './logged-drinks';
export { DrinkChooser } from './drink-chooser';

export function TonightView({
  member,
  alerts,
  busy,
  onQuick,
  onChoose,
  onWater,
  onUndo,
  pendingLogs,
  night,
  now,
  onEditPlan,
  onDismissAlert,
}: {
  night?: Night;
  now?: Date;
  onEditPlan?: () => void;
  onDismissAlert?: (id: string) => void;
  member: MemberSnapshot;
  alerts: NightSnapshot['alerts'];
  busy: boolean;
  onQuick: () => void;
  onChoose: () => void;
  onWater: () => void;
  onUndo: () => void;
  pendingLogs: readonly PendingDrinkLog[];
}) {
  const drinks = withPendingDrinks(member, pendingLogs);
  const totals = calculateMemberTotals(drinks, member.waterLogs);
  const pendingAlcohol = drinks.length - member.drinkLogs.length;
  const pendingWater = pendingLogs.filter((record) => record.kind === 'water').length;
  const planTotal = member.planItems.length === 0 ? 0 : calculatePlanTotal(member.planItems);
  const planStatus = determinePlanStatus(totals.ethanolGrams, planTotal);
  const quick = member.planItems.find((item) => item.isQuickLog) ?? member.planItems[0];
  const pacing =
    night && now
      ? calculatePlanPacing(member.planItems, drinks, member.id, night.startsAt, night.endsAt, now)
      : null;
  return (
    <section className="stack">
      {alerts.map((alert) => (
        <TimedNotice key={alert.id} onDismiss={() => onDismissAlert?.(alert.id)}>
          <BellRing aria-hidden="true" size={20} />
          <span>{alert.message}</span>
        </TimedNotice>
      ))}
      <Card className="personal-card stack-lg">
        <div className="row-between">
          <div>
            <h2>{member.displayName}</h2>
          </div>
          <span
            className={`pill${totals.ethanolGrams > 0 && planStatus !== 'within_plan' ? ' pill-warning' : ''}`}
          >
            {member.planSetupCompletedAt === null
              ? 'Plan not set'
              : planTotal === 0 && totals.ethanolGrams === 0
                ? 'Water only'
                : planStatus === 'exceeded'
                  ? 'Over plan'
                  : planStatus === 'reached'
                    ? 'Plan reached'
                    : 'Within plan'}
          </span>
        </div>
        <div>
          <strong data-testid="drink-count" className="big-count">
            {totals.alcoholCount}
          </strong>
          <span className="muted"> drinks logged</span>
          {totals.alcoholCount > 0 && (
            <p className="muted small">{formatCategories(totals.categoryCounts)}</p>
          )}
          {totals.ethanolGrams > 0 && (
            <p className="muted small">
              {totals.standardDrinkEquivalent} standard drinks · 10 g alcohol each
            </p>
          )}
          {pendingAlcohol + pendingWater === 0 ? null : (
            <p className="pill pill-warning">{pendingAlcohol + pendingWater} waiting to save</p>
          )}
        </div>
        {quick && (
          <div className="main-drink row-between">
            <div>
              <span className="muted small">Main drink</span>
              <strong>
                {quick.label} · {quick.volumeMl} ml · {quick.abvPercent}%
              </strong>
            </div>
            {onEditPlan && (
              <Button type="button" variant="ghost" disabled={busy} onClick={onEditPlan}>
                Change
              </Button>
            )}
          </div>
        )}
        <Button data-tour="log-drink" type="button" full disabled={busy} onClick={onQuick}>
          <Plus aria-hidden="true" size={26} />{' '}
          {quick === undefined ? 'Add an alcohol plan' : `Log ${quick.label}`}
        </Button>
        <div className="quick-actions" data-tour="drink-options">
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
        <div className="plan-summary" data-tour="plan">
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
        {pacing && (
          <p className="info-box small" data-testid="plan-pacing">
            {pacing.status === 'finished'
              ? 'Your plan or planned time is complete. Consider switching to water.'
              : pacing.status === 'packed'
                ? 'This plan puts drinks close together. Consider planning fewer drinks.'
                : pacing.status === 'pause'
                  ? 'Pause for now. Consider water or skipping the remaining drinks.'
                  : pacing.waitMinutes > 0
                    ? `Take a break: about ${pacing.waitMinutes} min until your next planned drink.`
                    : `Plan spacing: about ${pacing.intervalMinutes} min per main drink.`}{' '}
            <span className="muted">
              Plan spacing is not a safe drinking rate. No need to finish every drink.
            </span>
          </p>
        )}
      </Card>
    </section>
  );
}

export function ParticipantCard({
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
  canCheckIn,
  checkInLabel,
  checkInState,
  onCheckIn,
  guestNote,
  onDismissAlert,
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
  canCheckIn?: boolean | undefined;
  checkInLabel?: string | undefined;
  checkInState?: 'idle' | 'sending' | 'sent' | 'error' | undefined;
  onCheckIn?: (() => void) | undefined;
  guestNote?: string | undefined;
  onDismissAlert?: (id: string) => void;
}) {
  const totals = calculateMemberTotals(member.drinkLogs, member.waterLogs);
  const pendingAlcoholEntries = pendingLogs.flatMap((record) => {
    if (
      record.kind !== 'alcohol' ||
      record.drinkSnapshot === undefined ||
      record.status === 'permanent_failure' ||
      record.status === 'needs_confirmation'
    )
      return [];
    return [{ ...record.drinkSnapshot, count: 1, pending: true }];
  });
  const pendingAlcohol = pendingAlcoholEntries.length;
  const pendingWater = pendingLogs.filter((record) => record.kind === 'water').length;
  const breakdown = buildDrinkBreakdown(member.drinkLogs, pendingAlcoholEntries);
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
              {member.memberType === 'guest'
                ? 'Guest'
                : member.userId === null
                  ? 'Former member'
                  : 'Tracks their own drinks'}
              {member.leftAt === null ? '' : ' · left'}
            </p>
          </div>
        </div>
        {canCheckIn && onCheckIn ? (
          <Button
            type="button"
            variant="secondary"
            disabled={busy || checkInState === 'sending'}
            onClick={onCheckIn}
          >
            {checkInState === 'sending'
              ? 'Sending…'
              : checkInState === 'sent'
                ? 'Check in again'
                : (checkInLabel ?? 'Check in')}
          </Button>
        ) : alerts.length > 0 ? (
          <span className="pill pill-warning">Attention</span>
        ) : null}
      </div>
      <div className="row-between">
        <span>
          {totals.alcoholCount} {totals.alcoholCount === 1 ? 'drink' : 'drinks'}
          {pendingAlcohol === 0 ? '' : ` · ${pendingAlcohol} pending`}
          {' · '}
          {member.planSetupCompletedAt === null
            ? 'Plan not set'
            : member.planItems.length === 0
              ? 'Water only'
              : `Planned · ${planned} ${planned === 1 ? 'drink' : 'drinks'}`}
        </span>
        {lastActivity === undefined ? null : (
          <span className="muted small">{relativeTime(lastActivity.consumedAt)}</span>
        )}
      </div>
      <p className="muted small">{formatCategories(totals.categoryCounts)}</p>
      {alerts.map((alert) => (
        <TimedNotice
          key={alert.id}
          className="warning-box row small"
          onDismiss={() => onDismissAlert?.(alert.id)}
        >
          {alert.message}
        </TimedNotice>
      ))}
      {breakdown.length === 0 ? (
        <p className="muted small">No alcohol logged.</p>
      ) : (
        <details className="small">
          <summary>{breakdown.map((entry) => `${entry.count} ${entry.label}`).join(' · ')}</summary>
          <ul className="compact-list">
            {breakdown.map((entry) => (
              <li
                key={`${entry.label}-${entry.category}-${entry.volumeMl}-${entry.abvPercent}-${entry.pending ? 'pending' : 'saved'}`}
              >
                {entry.count} × {entry.label} · {entry.volumeMl} ml · {entry.abvPercent}%
                {entry.pending ? ' · pending on this device' : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="muted small">
        Water: {totals.waterCount}
        {pendingWater === 0 ? '' : ` · ${pendingWater} pending on this device`}
      </p>
      {guestNote ? <p className="muted small">{guestNote}</p> : null}
      {managed && member.leftAt === null ? (
        <div className="guest-controls stack">
          <Button type="button" full disabled={busy} onClick={onQuick}>
            <Plus aria-hidden="true" size={20} />{' '}
            {quick === undefined
              ? `Set ${member.displayName}'s plan`
              : `Log ${quick.label} for ${member.displayName}`}
          </Button>
          <div className="quick-actions" data-tour="log">
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
