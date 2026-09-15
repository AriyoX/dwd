import Link from 'next/link';
import { ArrowRight, ChevronDown, Moon, Plus, Users } from 'lucide-react';
import { getActiveNights } from '@dwd/data';
import { Card } from '@/components/ui/card';
import { Wordmark } from '@/components/layout/wordmark';
import { NightIllustration } from '@/components/layout/night-illustration';
import { SignOutButton } from '@/features/auth/sign-out-button';
import { TourButton } from '@/features/tour/tour-provider';
import { JoinCodeForm } from '@/features/nights/join-code-form';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function HomePage() {
  const client = await createServerSupabaseClient();
  const [nights, claimsResult] = await Promise.all([
    getActiveNights(client),
    client.auth.getClaims(),
  ]);
  const userId = claimsResult.data?.claims.sub;
  const profile =
    userId === undefined
      ? null
      : (await client.from('profiles').select('display_name').eq('id', userId).maybeSingle()).data;
  const name = profile?.display_name ?? 'Your account';
  const firstName = profile?.display_name.split(' ')[0];

  return (
    <main className="page-shell home-shell" id="main-content">
      <header className="topbar">
        <Wordmark linked={false} />
        <details className="account-menu">
          <summary aria-label="Account menu">
            <span className="avatar" aria-hidden="true">
              {name.slice(0, 1).toUpperCase()}
            </span>
            <span className="account-name small">{name}</span>
            <ChevronDown aria-hidden="true" size={16} />
          </summary>
          <div className="account-popover">
            <p className="small muted">{name}</p>
            <Link className="text-link" href="/history">
              Night history
            </Link>
            <Link className="text-link" href="/account">
              Your account
            </Link>
            <Link className="text-link" href="/feedback">
              Feedback & support
            </Link>
            <TourButton />
            <SignOutButton />
          </div>
        </details>
      </header>
      <header className="home-heading">
        <h1>{firstName ? `Your evening, ${firstName}.` : 'Your evening starts here.'}</h1>
        <span className="pill">
          <Moon size={14} aria-hidden="true" /> Your own pace
        </span>
      </header>
      <div className="stack-lg">
        <Link data-tour="history" className="text-link" href="/history">
          Night history
        </Link>
        {nights.length > 0 ? (
          <section className="stack" aria-labelledby="active-nights">
            <div className="section-heading">
              <h2 id="active-nights">Your active nights</h2>
              <span className="pill">{nights.length}</span>
            </div>
            {nights.map((night) => (
              <Link key={night.id} className="resume-card" href={`/night/${night.id}`}>
                <span className="card-icon" style={{ margin: 0 }}>
                  <Moon aria-hidden="true" size={22} />
                </span>
                <div>
                  <span className="pill pill-online">Active</span>
                  <strong>{night.title}</strong>
                  <span className="muted small">
                    {night.role === 'host' ? 'Hosting' : 'Joined'} · Resume night
                  </span>
                </div>
                <ArrowRight aria-hidden="true" size={22} />
              </Link>
            ))}
          </section>
        ) : null}
        <section className="home-actions" aria-label="Start or join a night">
          <Card className="start-card">
            <h2>A night of your own.</h2>
            <NightIllustration compact />
            <Link data-tour="start" className="button button-primary" href="/night/new">
              <Plus aria-hidden="true" size={19} /> Start a night{' '}
              <ArrowRight aria-hidden="true" size={18} />
            </Link>
          </Card>
          <Card className="join-card">
            <header>
              <span className="card-icon">
                <Users aria-hidden="true" size={23} />
              </span>
              <h2>Join your mates</h2>
            </header>
            <div data-tour="join">
              <JoinCodeForm />
            </div>
          </Card>
        </section>
        {nights.length === 0 ? (
          <section className="stack" aria-labelledby="active-nights">
            <h2 id="active-nights">Your active nights</h2>
            <div className="empty-state">
              <Moon size={28} strokeWidth={1.5} aria-hidden="true" />
              <span className="muted small">No active nights yet.</span>
            </div>
          </section>
        ) : null}
      </div>
      <footer className="app-footer">
        <p>DWD cannot determine sobriety or driving safety.</p>
        <nav aria-label="Legal">
          <Link href="/feedback">Feedback & support</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </footer>
    </main>
  );
}
