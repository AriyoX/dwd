import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { CalendarClock, UserRound } from 'lucide-react';
import { Wordmark } from '@/components/layout/wordmark';
import { Card, Eyebrow } from '@/components/ui/card';
import { JoinInvitation } from '@/features/invites/join-invitation';
import { previewInvite } from '@/features/invites/actions';
import { allowInviteLookup } from '@/features/invites/rate-limit.server';
import { getAuthenticatedUserId } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Join a night' };
export const dynamic = 'force-dynamic';

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const requestHeaders = await headers();
  const rateKey = `${requestHeaders.get('x-forwarded-for') ?? 'local'}:${token.slice(0, 10)}`;
  const preview = allowInviteLookup(rateKey)
    ? await previewInvite(token)
    : { valid: false as const };
  const userId = await getAuthenticatedUserId();
  const next = `/join/${encodeURIComponent(token)}`;

  return (
    <main className="page-shell error-page" id="main-content">
      <div className="stack-lg">
        <Wordmark />
        {!preview.valid ? (
          <Card className="stack">
            <h1>This link cannot be used.</h1>
            <p className="muted">
              It may be invalid, expired, revoked, full, or attached to an ended night.
            </p>
            <Link className="button button-secondary" href="/home">
              Go to home
            </Link>
          </Card>
        ) : (
          <Card className="stack-lg card-amber">
            <header>
              <Eyebrow>Private invitation</Eyebrow>
              <h1>{preview.nightTitle}</h1>
            </header>
            <div className="stack">
              <div className="row">
                <UserRound aria-hidden="true" size={21} color="var(--amber)" />
                <span>
                  Hosted by <strong>{preview.hostDisplayName}</strong>
                </span>
              </div>
              <div className="row">
                <CalendarClock aria-hidden="true" size={21} color="var(--amber)" />
                <span>
                  {formatTime(preview.startsAt)} – {formatTime(preview.endsAt)}
                </span>
              </div>
            </div>
            {userId === null ? (
              <div className="stack">
                <Link
                  className="button button-primary"
                  href={`/login?next=${encodeURIComponent(next)}`}
                >
                  Sign in to join
                </Link>
                <Link
                  className="button button-secondary"
                  href={`/signup?next=${encodeURIComponent(next)}`}
                >
                  Create account
                </Link>
              </div>
            ) : (
              <JoinInvitation token={token} />
            )}
          </Card>
        )}
      </div>
    </main>
  );
}
