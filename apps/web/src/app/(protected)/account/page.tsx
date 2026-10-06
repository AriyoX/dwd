import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUpRight,
  Bell,
  Compass,
  MessageCircle,
  Shield,
  UserRound,
} from 'lucide-react';
import { Wordmark } from '@/components/layout/wordmark';
import { Card } from '@/components/ui/card';
import { AccountDeletion } from '@/features/account/account-deletion';
import { TourButton } from '@/features/tour/tour-provider';
import { DisplayNameForm, NotificationSettings } from '@/features/account/account-controls';
import { NotificationInbox } from '@/features/notifications/notification-inbox';
import { CountrySettings } from '@/features/account/country-settings';
import {
  getMyNotificationEvents,
  getNotificationPreferences,
  getPreplotPreferences,
} from '@dwd/data';
import type { NotificationEvent } from '@dwd/core';
import { createServerSupabaseClient } from '@/lib/supabase/server';
export const metadata = { title: 'Your account' };
export default async function AccountPage() {
  const client = await createServerSupabaseClient();
  const { data: claims } = await client.auth.getClaims();
  const userId = claims?.claims.sub;
  const profile = userId
    ? (await client.from('profiles').select('display_name').eq('id', userId).maybeSingle()).data
    : null;
  const result = await client
    .from('support_requests')
    .select('id, kind, status, response, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  const requests = result.data ?? [];
  const deletionResult = await client
    .from('account_deletions')
    .select('delete_after, status')
    .maybeSingle();
  const [preferences, events, countryPreferences] = await Promise.all([
    getNotificationPreferences(client).catch(() => null),
    getMyNotificationEvents(client).catch((): NotificationEvent[] => []),
    getPreplotPreferences(client).catch(() => null),
  ]);
  return (
    <main id="main-content" className="page-shell settings-shell">
      <header className="topbar">
        <Wordmark />
        <Link className="back-link" href="/home">
          <ArrowLeft size={17} aria-hidden="true" /> Home
        </Link>
      </header>
      <section className="stack-lg">
        <header className="page-heading account-heading">
          <span className="profile-avatar" aria-hidden="true">
            {(profile?.display_name || 'You').slice(0, 1).toUpperCase()}
          </span>
          <h1>
            Your account<span className="heading-dot">.</span>
          </h1>
        </header>
        <div className="settings-layout">
          <div className="stack-lg">
            <Card className="stack settings-card">
              <h2 className="section-title">
                <UserRound size={20} aria-hidden="true" /> Your profile
              </h2>
              <DisplayNameForm initialName={profile?.display_name ?? ''} />
              {countryPreferences ? (
                <CountrySettings initial={countryPreferences} />
              ) : (
                <p className="error-box" role="alert">
                  Country settings could not load. Reload to retry.
                </p>
              )}
              <p className="muted small">Past nights keep the name you used at the time.</p>
            </Card>
            <Card className="stack settings-card">
              {preferences ? (
                <NotificationSettings initialPreferences={preferences} initialEvents={events} />
              ) : (
                <>
                  <h2 className="section-title">
                    <Bell size={20} aria-hidden="true" /> Reminders
                  </h2>
                  <p className="error-box" role="alert">
                    We couldn’t load your reminders.{' '}
                    <Link className="text-link" href="/account">
                      Retry
                    </Link>
                  </p>
                  <NotificationInbox initialEvents={events} />
                </>
              )}
            </Card>
          </div>
          <div className="stack-lg settings-sidebar">
            <Card className="stack settings-card" id="messages">
              <h2 className="section-title">
                <MessageCircle size={20} aria-hidden="true" /> Your messages
              </h2>
              {result.error ? (
                <p role="alert">
                  We couldn’t load your messages.{' '}
                  <Link href="/account" className="text-link">
                    Retry
                  </Link>
                </p>
              ) : requests.length === 0 ? (
                <div className="settings-empty">
                  <MessageCircle size={28} strokeWidth={1.5} aria-hidden="true" />
                  <p>No messages yet</p>
                </div>
              ) : (
                requests.map((request) => (
                  <article className="stack request-record" key={request.id}>
                    <div className="row-between">
                      <strong>
                        {request.kind === 'deletion'
                          ? 'Account deletion'
                          : request.kind === 'problem'
                            ? 'Something went wrong'
                            : 'Feedback'}
                      </strong>
                      <span className="pill">
                        {request.status === 'completed'
                          ? 'Resolved'
                          : request.status === 'in_review'
                            ? 'In review'
                            : 'Received'}
                      </span>
                    </div>
                    <p className="muted small">
                      {new Date(request.created_at).toLocaleDateString('en', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                    {request.response && <p className="support-response">{request.response}</p>}
                    <details className="request-reference small muted">
                      <summary>Message reference</summary>
                      <p>{request.id}</p>
                    </details>
                  </article>
                ))
              )}
              <Link href="/feedback" className="text-link">
                Send a message <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </Card>
            <Card className="stack settings-card tour-invitation">
              <span className="settings-feature-icon">
                <Compass size={28} aria-hidden="true" />
              </span>
              <h2>A little look around</h2>
              <TourButton className="button button-secondary" />
            </Card>
            <Card className="stack settings-card">
              <h2 className="section-title">
                <Shield size={20} aria-hidden="true" /> Privacy & account
              </h2>
              <Link href="/privacy" className="text-link">
                Your privacy <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
              {deletionResult.error ? (
                <p className="error-box" role="alert">
                  Account deletion settings could not load. Reload this page to retry.
                </p>
              ) : (
                <AccountDeletion initialDeletion={deletionResult.data} />
              )}
            </Card>
          </div>
        </div>
      </section>
    </main>
  );
}
