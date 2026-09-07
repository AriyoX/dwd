import type { Metadata } from 'next';
import Link from 'next/link';
import { calculateMemberTotals, calculatePlanTotal } from '@dwd/core';
import { getNightSnapshot } from '@dwd/data';
import { Card, Eyebrow } from '@/components/ui/card';
import { Wordmark } from '@/components/layout/wordmark';
import { EndedNightOutbox } from '@/features/offline/ended-night-outbox';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Night summary' };

const formatter = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

export default async function NightSummaryPage({
  params,
}: {
  params: Promise<{ nightId: string }>;
}) {
  const { nightId } = await params;
  const client = await createServerSupabaseClient();
  const snapshot = await getNightSnapshot(client, nightId).catch(() => null);
  if (snapshot === null) notFound();
  if (snapshot.night.status !== 'ended') redirect(`/night/${nightId}`);
  const finalWasExtended = snapshot.night.endsAt !== snapshot.night.initialEndsAt;

  return (
    <main className="page-shell" id="main-content">
      <header className="topbar">
        <Wordmark />
      </header>
      <div className="stack-lg">
        <header>
          <Eyebrow>Night ended</Eyebrow>
          <h1>{snapshot.night.title}</h1>
          <p className="muted">
            A factual record of what was logged. Counts are approximate and are not a safety
            assessment.
          </p>
        </header>
        <Card className="timeline-card">
          <Timeline label="Started" value={snapshot.night.startsAt} />
          <Timeline label="Original planned end" value={snapshot.night.initialEndsAt} />
          {finalWasExtended ? (
            <Timeline label="Final planned end" value={snapshot.night.endsAt} />
          ) : null}
          <Timeline label="Actually ended" value={snapshot.night.endedAt} />
        </Card>
        <EndedNightOutbox nightId={snapshot.night.id} currentUserId={snapshot.currentUserId} />
        <section className="stack">
          <h2>Participants</h2>
          {snapshot.members.map((member) => {
            const totals = calculateMemberTotals(member.drinkLogs, member.waterLogs);
            const planGrams =
              member.planItems.length === 0 ? 0 : calculatePlanTotal(member.planItems);
            return (
              <Card className="stack" key={member.id}>
                <div className="row-between">
                  <div>
                    <strong>{member.displayName}</strong>
                    <p className="muted small">
                      {member.memberType === 'guest' ? 'Managed guest' : 'Account participant'}
                    </p>
                  </div>
                  <span className="pill">{totals.alcoholCount} drinks</span>
                </div>
                <div className="summary-grid">
                  <SummaryValue
                    label="Pure alcohol"
                    value={`${totals.ethanolGrams.toFixed(1)} g`}
                  />
                  <SummaryValue
                    label="Plan"
                    value={planGrams === 0 ? 'Water only' : `${planGrams.toFixed(1)} g`}
                  />
                  <SummaryValue label="After planned end" value={String(totals.afterEndCount)} />
                  <SummaryValue label="Water" value={String(totals.waterCount)} />
                </div>
                <p className="muted small">
                  {Object.entries(totals.categoryCounts)
                    .map(([category, count]) => `${count} ${category}`)
                    .join(' · ') || 'No alcohol entries'}
                </p>
              </Card>
            );
          })}
        </section>
        <Link className="button button-primary" href="/home">
          Back to home
        </Link>
        <p className="muted small">
          DWD is not a medical device, BAC calculator, sobriety detector, or driving-safety tool.
        </p>
      </div>
    </main>
  );
}

function Timeline({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <span className="muted small">{label}</span>
      <strong>{value === null ? '—' : formatter.format(new Date(value))}</strong>
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
