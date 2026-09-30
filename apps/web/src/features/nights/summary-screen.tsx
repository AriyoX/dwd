import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft, Clock3, Droplets, Moon, Wine } from 'lucide-react';
import {
  buildDrinkBreakdown,
  calculateMemberTotals,
  calculatePlanTotal,
  formatNightDateTime,
  type NightSnapshot,
} from '@dwd/core';
import { Card } from '@/components/ui/card';
import { Wordmark } from '@/components/layout/wordmark';
import { MemoriesGallery } from '@/features/photos/memories-gallery';

export function SummaryScreen({
  snapshot,
  pendingEntries,
  sample = false,
  photoGallery,
}: {
  snapshot: NightSnapshot;
  pendingEntries?: ReactNode;
  sample?: boolean;
  photoGallery?: ReactNode;
}) {
  const finalWasExtended = snapshot.night.endsAt !== snapshot.night.initialEndsAt;
  const personal = snapshot.historyScope === 'personal';
  return (
    <main className="page-shell recap-shell" id="main-content">
      <header className="topbar">
        <Wordmark />
        <Link href={sample ? '/history?tour=history' : '/history'} className="back-link">
          <ArrowLeft size={17} aria-hidden="true" /> Night history
        </Link>
      </header>
      <div className="stack-lg">
        <header className="page-heading recap-heading">
          <div className="recap-date">
            <Moon size={17} aria-hidden="true" />
            <span>
              {new Date(snapshot.night.startsAt).toLocaleDateString('en', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                timeZone: snapshot.night.timezone || 'UTC',
              })}
            </span>
            {sample && <span className="pill">Tour practice</span>}
          </div>
          <h1>{snapshot.night.title}</h1>
          {personal ? (
            <p className="muted small">This recap shows your own drinks and plans.</p>
          ) : null}
        </header>
        {photoGallery ??
          (sample ? null : (
            <MemoriesGallery nightId={snapshot.night.id} currentUserId={snapshot.currentUserId} />
          ))}
        <Card className="stack recap-timeline">
          <h2 className="section-title">
            <Clock3 size={19} aria-hidden="true" /> How the night went
          </h2>
          <div className="timeline-card">
            <Timeline
              label="Started"
              value={snapshot.night.startsAt}
              timezone={snapshot.night.timezone}
            />
            <Timeline
              label="Planned finish"
              value={snapshot.night.initialEndsAt}
              timezone={snapshot.night.timezone}
            />
            {finalWasExtended ? (
              <Timeline
                label="Moved to"
                value={snapshot.night.endsAt}
                timezone={snapshot.night.timezone}
              />
            ) : null}
            <Timeline
              label="Wrapped up"
              value={snapshot.night.endedAt}
              timezone={snapshot.night.timezone}
            />
          </div>
        </Card>
        {pendingEntries}
        <section className="stack">
          <div className="row-between">
            <h2>{personal ? 'Your night in drinks' : 'Everyone’s night'}</h2>
            {!personal && (
              <span className="pill">
                {snapshot.members.length} {snapshot.members.length === 1 ? 'person' : 'people'}
              </span>
            )}
          </div>
          <div className="recap-members">
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
                  className="stack recap-member"
                  key={member.id}
                >
                  <div className="row-between">
                    <div className="row">
                      <span className="avatar" aria-hidden="true">
                        {member.displayName.slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <strong>{member.displayName}</strong>
                        <p className="muted small">
                          {member.memberType === 'guest'
                            ? 'Guest'
                            : member.userId === null
                              ? 'Former member'
                              : member.userId === snapshot.currentUserId
                                ? 'You'
                                : member.role === 'host'
                                  ? 'Host'
                                  : 'Friend'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="recap-counts">
                    <div>
                      <Wine size={20} aria-hidden="true" />
                      <strong>{totals.alcoholCount}</strong>
                      <span>{totals.alcoholCount === 1 ? 'drink' : 'drinks'}</span>
                    </div>
                    <div>
                      <Droplets size={20} aria-hidden="true" />
                      <strong>{totals.waterCount}</strong>
                      <span>{totals.waterCount === 1 ? 'chaser' : 'chasers'}</span>
                    </div>
                  </div>
                  <p className="muted small">
                    {buildDrinkBreakdown(member.drinkLogs)
                      .map((entry) => `${entry.count} ${entry.label}`)
                      .join(' · ') || 'No alcoholic drinks added'}
                  </p>
                  <details className="recap-details">
                    <summary>Drink details</summary>
                    <div className="summary-grid">
                      <SummaryValue
                        label="Alcohol in your drinks"
                        value={`${totals.ethanolGrams.toFixed(1)} g`}
                      />
                      <SummaryValue
                        label="Alcohol in your plan"
                        value={planGrams === 0 ? 'Chaser only' : `${planGrams.toFixed(1)} g`}
                      />
                      <SummaryValue
                        label="Drinks after the planned finish"
                        value={String(totals.afterEndCount)}
                      />
                    </div>
                  </details>
                  {addedLater.length > 0 ? (
                    <details className="small">
                      <summary>
                        {addedLater.length}{' '}
                        {addedLater.length === 1 ? 'drink added' : 'drinks added'} later
                      </summary>
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
          </div>
        </section>
        <Link className="button button-primary" href="/home">
          Back to home
        </Link>
        <footer className="recap-footer muted small">
          <p>Times shown in {snapshot.night.timezone || 'UTC'}.</p>
          <p>
            Based on the drinks you added. Amounts are approximate and can’t tell you whether you’re
            sober or safe to drive.
          </p>
        </footer>
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
