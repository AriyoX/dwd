import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  buildDrinkBreakdown,
  calculateMemberTotals,
  calculatePlanTotal,
  formatNightDateTime,
  type NightSnapshot,
} from '@dwd/core';
import { Card, Eyebrow } from '@/components/ui/card';
import { Wordmark } from '@/components/layout/wordmark';
import { MemoriesGallery } from '@/features/photos/memories-gallery';

export function SummaryScreen({
  snapshot,
  pendingEntries,
  sample = false,
}: {
  snapshot: NightSnapshot;
  pendingEntries?: ReactNode;
  sample?: boolean;
}) {
  const finalWasExtended = snapshot.night.endsAt !== snapshot.night.initialEndsAt;
  const personal = snapshot.historyScope === 'personal';
  return (
    <main className="page-shell" id="main-content">
      <header className="topbar">
        <Wordmark />
      </header>
      <div className="stack-lg">
        <header>
          <Eyebrow>{sample ? 'Tour practice' : personal ? 'Your history' : 'Night ended'}</Eyebrow>
          <h1>{snapshot.night.title}</h1>
          <p className="muted">
            A factual record of what was logged. Counts are approximate and are not a safety
            assessment.
          </p>
          {personal ? (
            <p className="muted small">
              This restricted view shows your own activity and plan history.
            </p>
          ) : null}
        </header>
        <Card className="timeline-card">
          <Timeline
            label="Started"
            value={snapshot.night.startsAt}
            timezone={snapshot.night.timezone}
          />
          <Timeline
            label="Original planned end"
            value={snapshot.night.initialEndsAt}
            timezone={snapshot.night.timezone}
          />
          {finalWasExtended ? (
            <Timeline
              label="Final planned end"
              value={snapshot.night.endsAt}
              timezone={snapshot.night.timezone}
            />
          ) : null}
          <Timeline
            label="Actually ended"
            value={snapshot.night.endedAt}
            timezone={snapshot.night.timezone}
          />
        </Card>
        {pendingEntries}
        <section className="stack">
          <h2>{personal ? 'Your activity' : 'Your group'}</h2>
          {snapshot.members.map((member, index) => {
            const totals = calculateMemberTotals(member.drinkLogs, member.waterLogs);
            const planGrams = calculatePlanTotal(
              member.planItems.filter((item) => item.archivedAt === null),
            );
            const addedLater = [
              ...member.drinkLogs
                .filter(
                  (log) =>
                    log.deletedAt === null &&
                    Date.parse(log.createdAt) - Date.parse(log.consumedAt) > 2 * 60_000,
                )
                .map((log) => ({ id: log.id, label: log.labelSnapshot, at: log.consumedAt })),
              ...member.waterLogs
                .filter(
                  (log) =>
                    log.deletedAt === null &&
                    Date.parse(log.createdAt) - Date.parse(log.consumedAt) > 2 * 60_000,
                )
                .map((log) => ({ id: log.id, label: 'Chaser', at: log.consumedAt })),
            ];
            return (
              <Card
                data-tour={index === 0 ? 'history-summary' : undefined}
                className="stack"
                key={member.id}
              >
                <div className="row-between">
                  <div>
                    <strong>{member.displayName}</strong>
                    <p className="muted small">
                      {member.memberType === 'guest'
                        ? 'Guest'
                        : member.userId === null
                          ? 'Former member'
                          : 'Tracks their own drinks'}
                    </p>
                  </div>
                  <span className="pill">
                    {totals.alcoholCount} {totals.alcoholCount === 1 ? 'drink' : 'drinks'}
                  </span>
                </div>
                <div className="summary-grid">
                  <SummaryValue
                    label="Pure alcohol"
                    value={`${totals.ethanolGrams.toFixed(1)} g`}
                  />
                  <SummaryValue
                    label="Plan"
                    value={planGrams === 0 ? 'Chaser only' : `${planGrams.toFixed(1)} g`}
                  />
                  <SummaryValue label="After planned end" value={String(totals.afterEndCount)} />
                  <SummaryValue label="Chasers" value={String(totals.waterCount)} />
                </div>
                <p className="muted small">
                  {buildDrinkBreakdown(member.drinkLogs)
                    .map((entry) => `${entry.count} ${entry.label}`)
                    .join(' · ') || 'No alcohol entries'}
                </p>
                {addedLater.length > 0 ? (
                  <details className="small">
                    <summary>{addedLater.length} added later</summary>
                    <ul className="compact-list">
                      {addedLater.map((entry) => (
                        <li key={entry.id}>
                          {entry.label} · about{' '}
                          {formatNightDateTime(entry.at, snapshot.night.timezone)}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </Card>
            );
          })}
        </section>
        {sample ? null : (
          <MemoriesGallery nightId={snapshot.night.id} currentUserId={snapshot.currentUserId} />
        )}
        <Link className="button button-primary" href="/home">
          Back to home
        </Link>
        <p className="muted small">Night times shown in {snapshot.night.timezone || 'UTC'}.</p>
        <p className="muted small">
          DWD is not a medical device, BAC calculator, sobriety detector, or driving-safety tool.
        </p>
      </div>
    </main>
  );
}

function Timeline({
  label,
  value,
  timezone,
}: {
  label: string;
  value: string | null;
  timezone: string;
}) {
  return (
    <div>
      <span className="muted small">{label}</span>
      <strong>{formatNightDateTime(value, timezone)}</strong>
    </div>
  );
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="muted small">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
