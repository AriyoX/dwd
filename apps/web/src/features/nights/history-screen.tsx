import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Droplets, Moon, Wine } from 'lucide-react';
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
    <main id="main-content" className="page-shell history-shell">
      <header className="topbar">
        <Wordmark />
        <Link href="/home" className="back-link">
          <ArrowLeft size={17} aria-hidden="true" /> Home
        </Link>
      </header>
      <section className="stack-lg">
        <header className="page-heading history-heading">
          <div>
            <span className="settings-feature-icon">
              <Moon size={28} aria-hidden="true" />
            </span>
            <h1>
              Night history<span className="heading-dot">.</span>
            </h1>
          </div>
          <div className="history-orbit" aria-hidden="true">
            <Moon size={48} strokeWidth={1} />
            <span>✦</span>
            <span>✧</span>
          </div>
        </header>
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
              <Card className="stack history-empty">
                <Moon size={34} strokeWidth={1.3} aria-hidden="true" />
                <h2>{page === 0 ? 'No finished nights yet' : 'No more nights'}</h2>
                <Link href={page === 0 ? '/home' : '/history'} className="text-link">
                  {page === 0 ? 'Go to your nights' : 'Back to latest nights'}
                </Link>
              </Card>
            ) : (
              <div className="history-list">
                {result.nights.map((night, index) => (
                  <Link
                    data-tour={index === 0 ? 'history-entry' : undefined}
                    className="history-card"
                    key={night.id}
                    href={
                      sample ? '/night/tour/summary?tour=history' : `/night/${night.id}/summary`
                    }
                  >
                    <div className="history-date" aria-hidden="true">
                      <span>
                        {new Date(night.startsAt).toLocaleDateString('en', {
                          month: 'short',
                          timeZone: night.timezone || 'UTC',
                        })}
                      </span>
                      <strong>
                        {new Date(night.startsAt).toLocaleDateString('en', {
                          day: '2-digit',
                          timeZone: night.timezone || 'UTC',
                        })}
                      </strong>
                    </div>
                    <div className="history-card-content">
                      <span className="history-card-meta">
                        {night.role === 'host' ? 'You hosted' : 'With friends'}{' '}
                        <span aria-hidden="true">·</span>{' '}
                        {new Date(night.startsAt).toLocaleDateString('en', {
                          month: 'long',
                          year: 'numeric',
                          timeZone: night.timezone || 'UTC',
                        })}
                      </span>
                      <strong>{night.title}</strong>
                      <span className="visually-hidden">
                        Ended {formatNightDateTime(night.endedAt, night.timezone)}
                      </span>
                      <span className="history-counts">
                        <span>
                          <Wine size={15} aria-hidden="true" /> {night.alcoholCount}{' '}
                          {night.alcoholCount === 1 ? 'drink' : 'drinks'}
                        </span>
                        <span>
                          <Droplets size={15} aria-hidden="true" /> {night.waterCount}{' '}
                          {night.waterCount === 1 ? 'chaser' : 'chasers'}
                        </span>
                      </span>
                    </div>
                    <span className="history-open">
                      <ArrowUpRight size={23} aria-hidden="true" />
                      <span className="visually-hidden">View recap</span>
                    </span>
                  </Link>
                ))}
              </div>
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
