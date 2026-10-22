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
  bottleDrinkWord,
  type SharedBottle,
  type Night,
  hasUnknownAmounts,
  quickCounts,
  quickMainDrink,
} from '@dwd/core';
import type { PendingDrinkLog } from '@dwd/contracts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TimedNotice } from '@/components/feedback/timed-notice';
import { withPendingDrinks } from './logged-drinks';
import { BottleProgress } from '@/features/bottles/bottle-shelf';
import { BottleMainHint } from '@/features/bottles/bottle-main-hint';
import { QuickNightActivity } from '@/features/quick-log/night-activity';
import { QuickLogControls } from '@/features/quick-log/log-controls';
import logStyles from '@/features/quick-log/quick-log.module.css';
import styles from './night-logger.module.css';
export { DrinkChooser } from './drink-chooser';

export function ParticipantSwitcher({
  members,
  selectedId,
  onSelect,
  onAdd,
}: {
  members: readonly MemberSnapshot[];
  selectedId: string;
  onSelect: (memberId: string) => void;
  onAdd?: (() => void) | undefined;
}) {
  if (members.length < 2 && onAdd === undefined) return null;

  return (
    <section className="participant-switcher" aria-label="Choose who you are logging for">
      <div className="row-between">
        <strong className="small">Logging for</strong>
        {onAdd ? (
          <Button type="button" variant="ghost" onClick={onAdd}>
            <Plus aria-hidden="true" size={18} /> Add person
          </Button>
        ) : null}
      </div>
      <div className="participant-switcher-track" role="group">
        {members.map((member) => {
          const selected = member.id === selectedId;
          return (
            <button
              key={member.id}
              type="button"
              aria-pressed={selected}
              className={`participant-chip${selected ? ' participant-chip-selected' : ''}`}
              onClick={() => onSelect(member.id)}
            >
              <span className="avatar" aria-hidden="true">
                {initials(member.displayName)}
              </span>
              <span>
                <strong>{member.displayName}</strong>
                <small>{member.memberType === 'guest' ? 'You log for them' : 'You'}</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function TonightView({
  bottle,
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
  onRefresh,
  managed = false,
}: {
  bottle?: SharedBottle | undefined;
  night?: Night;
  now?: Date;
  onEditPlan?: () => void;
  onDismissAlert?: (id: string) => void;
  onRefresh?: () => Promise<void>;
  managed?: boolean | undefined;
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
  const quick = quickMainDrink(member);
  const earlier = quickCounts(member.quickLogs ?? []);
  const drinkCount = totals.alcoholCount + earlier.drink;
  const chaserCount = totals.waterCount + pendingWater + earlier.chaser;
  const pacing =
    night && now && !hasUnknownAmounts(member.quickLogs)
      ? calculatePlanPacing(member.planItems, drinks, member.id, night.startsAt, night.endsAt, now)
      : null;
  return (
    <section className="stack">
      {alerts.map((alert) => (
        <TimedNotice key={alert.id} onDismiss={() => onDismissAlert?.(alert.id)}>
          <BellRing aria-hidden="true" size={20} />
          <span>{chaserCopy(alert.message)}</span>
        </TimedNotice>
      ))}
      <Card
        className={`personal-card stack-lg ${styles['card']}`}
        data-bottle-tracking={bottle ? '' : undefined}
      >
        <div className={`logging-context row-between ${styles['context']}`}>
          <div className="row">
            <span className="avatar avatar-large" aria-hidden="true">
              {initials(member.displayName)}
            </span>
            <div>
              <p className="muted small">Logging for</p>
              <h2>{member.displayName}</h2>
              {managed || member.memberType === 'guest' ? (
                <p className="muted small">{managed ? 'You log for them' : 'Guest'}</p>
              ) : null}
            </div>
          </div>
          <span
            className={`pill${totals.ethanolGrams > 0 && planStatus !== 'within_plan' ? ' pill-warning' : ''}`}
          >
            {hasUnknownAmounts(member.quickLogs)
              ? 'Some sizes unknown'
              : member.planSetupCompletedAt === null
                ? 'Plan not set'
                : planTotal === 0 && totals.ethanolGrams === 0
                  ? 'Chaser only'
                  : planStatus === 'exceeded'
                    ? 'Over plan'
                    : planStatus === 'reached'
                      ? 'Plan reached'
                      : 'Within plan'}
          </span>
        </div>
        <div className={logStyles['totals']}>
          <div className={logStyles['summary']}>
            <span data-testid="drink-count">{drinkCount}</span>{' '}
            {drinkCount === 1 ? 'drink' : 'drinks'} · {chaserCount}{' '}
            {chaserCount === 1 ? 'chaser' : 'chasers'}
          </div>
          {totals.alcoholCount > 0 && (
            <p className="muted small">{formatCategories(totals.categoryCounts)}</p>
          )}
          {totals.ethanolGrams > 0 && (
            <p className="muted small">
              {totals.standardDrinkEquivalent} standard drinks · 10 g alcohol each
              {hasUnknownAmounts(member.quickLogs) ? ' · excludes drinks without a size' : ''}
            </p>
          )}
          {pendingAlcohol + pendingWater === 0 ? null : (
            <p className="pill pill-warning">{pendingAlcohol + pendingWater} waiting to save</p>
          )}
        </div>
        {bottle && quick?.sharedBottleId === bottle.id && (
          <>
            <BottleProgress bottle={bottle} member={{ ...member, drinkLogs: drinks }} />
            <BottleMainHint
              key={`${member.id}:${bottle.id}`}
              memberId={member.id}
              bottleId={bottle.id}
              label={bottle.label}
            />
          </>
        )}
        <QuickLogControls
          disabled={busy}
          mainDrink={quick}
          onEditMain={onEditPlan}
          label={
            quick === undefined
              ? 'Plan drinks'
              : bottle
                ? `Log ${bottleDrinkWord(bottle.category)}`
                : `Log ${quick.label}`
          }
          onLog={onQuick}
          onChaser={onWater}
          onUndo={onUndo}
          onChoose={onChoose}
        />
        <QuickNightActivity
          member={member}
          {...(member.userId ? { accountId: member.userId } : {})}
          {...(onRefresh ? { refresh: onRefresh } : {})}
        />
        <div className="plan-summary" data-tour="plan">
          <span>
            Your plan · {chaserCount} {chaserCount === 1 ? 'chaser' : 'chasers'}
          </span>
          <strong>
            {member.planItems
              .map((item) => `${item.plannedQuantity} ${item.label.toLowerCase()}`)
              .join(' · ') || 'Chaser only'}
          </strong>
        </div>
        {pacing && (
          <p className="info-box small" data-testid="plan-pacing">
            {pacing.status === 'finished'
              ? 'Done for tonight? Switch to a chaser.'
              : pacing.status === 'packed'
                ? 'Consider fewer drinks tonight.'
                : pacing.status === 'pause'
                  ? 'Take a break. Have a chaser or skip the next drink.'
                  : pacing.waitMinutes > 0
                    ? 'Take your time. Have a chaser between drinks.'
                    : 'You don’t have to finish every drink in your plan.'}
          </p>
        )}
      </Card>
    </section>
  );
}

export function ParticipantCard({
  member,
  isSelf = false,
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
  onDismissAlert,
  onRefresh,
}: {
  member: MemberSnapshot;
  isSelf?: boolean;
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
  onDismissAlert?: (id: string) => void;
  onRefresh?: () => Promise<void>;
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
  const lastActivity = [
    ...member.drinkLogs,
    ...member.waterLogs,
    ...(member.quickLogs ?? [])
      .filter((e) => !e.deletedAt)
      .map((e) => ({ ...e, consumedAt: e.recordedAt })),
  ].sort((a, b) => Date.parse(b.consumedAt) - Date.parse(a.consumedAt))[0];
  return (
    <Card className="participant-card stack">
      <div className="participant-heading">
        <span className="avatar avatar-large" aria-hidden="true">
          {initials(member.displayName)}
        </span>
        <div className="participant-identity">
          <h3>
            {member.displayName}
            {isSelf ? ' (you)' : ''}
          </h3>
          <p className="muted small">
            {member.leftAt !== null
              ? 'Left the night'
              : managed
                ? 'You log for them'
                : isSelf
                  ? 'Your night'
                  : member.memberType === 'guest'
                    ? 'Host logs for them'
                    : member.userId === null
                      ? 'Former member'
                      : 'Logs their own drinks'}
          </p>
        </div>
        {alerts.length > 0 ? <span className="pill pill-warning">Check in</span> : null}
      </div>
      <dl className="participant-stats">
        <div>
          <dt>Drinks</dt>
          <dd>
            {totals.alcoholCount + pendingAlcohol + quickCounts(member.quickLogs ?? []).drink}
          </dd>
        </div>
        <div>
          <dt>Chasers</dt>
          <dd>{totals.waterCount + pendingWater + quickCounts(member.quickLogs ?? []).chaser}</dd>
        </div>
        <div>
          <dt>Planned drinks</dt>
          <dd>{member.planSetupCompletedAt === null ? '—' : planned}</dd>
        </div>
      </dl>
      <QuickNightActivity
        member={member}
        {...(isSelf && member.userId ? { accountId: member.userId } : {})}
        {...(onRefresh ? { refresh: onRefresh } : {})}
      />
      <div className="participant-activity muted small">
        <span>
          {member.planSetupCompletedAt === null
            ? 'No plan yet'
            : member.planItems.length === 0
              ? 'Chaser only'
              : lastActivity
                ? `Last logged ${relativeTime(lastActivity.consumedAt)}`
                : 'Nothing logged yet'}
        </span>
        {pendingAlcohol + pendingWater > 0 ? (
          <span role="status">{pendingAlcohol + pendingWater} waiting to save</span>
        ) : null}
      </div>
      {alerts.map((alert) => (
        <TimedNotice
          key={alert.id}
          className="warning-box row small"
          onDismiss={() => onDismissAlert?.(alert.id)}
        >
          {chaserCopy(alert.message)}
        </TimedNotice>
      ))}
      {breakdown.length > 0 ? (
        <details className="participant-details small">
          <summary>View drinks</summary>
          <ul className="compact-list">
            {breakdown.map((entry) => (
              <li
                key={`${entry.label}-${entry.category}-${entry.volumeMl}-${entry.abvPercent}-${entry.pending ? 'pending' : 'saved'}`}
              >
                {entry.count} × {entry.label} · {entry.volumeMl} ml · {entry.abvPercent}%
                {entry.pending ? ' · waiting to save' : ''}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {canCheckIn && onCheckIn ? (
        <Button
          type="button"
          variant="secondary"
          full
          disabled={busy || checkInState === 'sending'}
          onClick={onCheckIn}
        >
          <BellRing aria-hidden="true" size={18} />
          {checkInState === 'sending'
            ? 'Sending…'
            : checkInState === 'sent'
              ? 'Check in again'
              : (checkInLabel ?? 'Check in')}
        </Button>
      ) : null}
      {managed && member.leftAt === null ? (
        <div className="guest-controls stack">
          <Button type="button" full disabled={busy} onClick={onQuick}>
            <Plus aria-hidden="true" size={20} />
            {quick === undefined
              ? `Set ${member.displayName}'s plan`
              : `Log ${quick.label} for ${member.displayName}`}
          </Button>
          <div className="participant-log-actions" data-tour="log">
            <Button
              type="button"
              variant="secondary"
              disabled={busy || member.planItems.length === 0}
              onClick={onChoose}
            >
              Another drink
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="button-water"
              disabled={busy}
              onClick={onWater}
            >
              <Droplets aria-hidden="true" size={18} /> Chaser
            </Button>
          </div>
          <details className="participant-details">
            <summary>Manage {member.displayName}</summary>
            <div className="stack participant-manage-actions">
              <Button type="button" variant="ghost" disabled={busy} onClick={onUndo}>
                <Undo2 aria-hidden="true" size={18} /> Undo last entry
              </Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={onEditPlan}>
                <Pencil aria-hidden="true" size={18} /> Adjust {member.displayName}&apos;s plan
              </Button>
              <Button type="button" variant="danger" disabled={busy} onClick={onRemove}>
                Remove {member.displayName}
              </Button>
            </div>
          </details>
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

function chaserCopy(value: string): string {
  return value.replace(/\bwaters\b/gi, 'chasers').replace(/\bwater\b/gi, 'chaser');
}
