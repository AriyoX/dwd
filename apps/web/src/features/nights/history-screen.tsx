import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { formatNightDateTime, type FinishedNight } from '@dwd/core';
import { Wordmark } from '@/components/layout/wordmark';
import { Card } from '@/components/ui/card';

export interface HistoryResult {
  nights: FinishedNight[];
  hasMore: boolean;
}

export function HistoryScreen({
  result,
  page = 0,
  sample = false,
}: {
  result: HistoryResult | null;
  page?: number;
  sample?: boolean;
}) {
  return (
    <main id="main-content" className="page-shell">
      <header className="topbar">
        <Wordmark />
        <Link href="/home" className="text-link">
          Home
        </Link>
      </header>
      <section className="stack-lg">
        <h1>Night history.</h1>
        {sample && <span className="pill">Tour practice</span>}
        {result === null ? (
          <Card className="stack">
            <p role="alert">Could not load your history. Check your connection and retry.</p>
            <Link className="button button-secondary" href={`/history?page=${page}`}>
              Retry history
            </Link>
          </Card>
        ) : (
          <>
            {result.nights.length === 0 ? (
              <Card className="stack">
                <h2>{page === 0 ? 'No finished nights yet' : 'No more nights'}</h2>
                <p className="muted small">
                  Finished nights you joined stay in your personal history, including nights you
                  left. Former members see their own activity only.
                </p>
                <Link href={page === 0 ? '/home' : '/history'} className="text-link">
                  {page === 0 ? 'Go to your nights' : 'Back to latest nights'}
                </Link>
              </Card>
            ) : (
              result.nights.map((night, index) => (
                <Link
                  data-tour={index === 0 ? 'history-entry' : undefined}
                  className="resume-card"
                  key={night.id}
                  href={sample ? '/night/tour/summary?tour=history' : `/night/${night.id}/summary`}
                >
                  <div>
                    <strong>{night.title}</strong>
                    <span className="muted small">
                      {night.role === 'host' ? 'Hosted' : 'Joined'} · Ended{' '}
                      {formatNightDateTime(night.endedAt, night.timezone)}
                      <br />
                      {night.alcoholCount} {night.alcoholCount === 1 ? 'drink' : 'drinks'} ·{' '}
                      {night.waterCount} water
                    </span>
                  </div>
                  <span className="row">
                    Summary <ArrowRight size={18} aria-hidden="true" />
                  </span>
                </Link>
              ))
            )}
            <nav className="row-between" aria-label="History pages">
              {page > 0 && (
                <Link className="button button-secondary" href={`/history?page=${page - 1}`}>
                  Newer nights
                </Link>
              )}
              {result.hasMore && (
                <Link className="button button-secondary" href={`/history?page=${page + 1}`}>
                  Older nights
                </Link>
              )}
            </nav>
          </>
        )}
      </section>
    </main>
  );
}
