import Link from 'next/link';
import { Wordmark } from '@/components/layout/wordmark';
import { Card } from '@/components/ui/card';
import { RequestForm } from '@/features/support/request-form';
import { TourButton } from '@/features/tour/tour-provider';
import { DisplayNameForm, NotificationSettings } from '@/features/account/account-controls';
import { NotificationInbox } from '@/features/notifications/notification-inbox';
import { getMyNotificationEvents, getNotificationPreferences } from '@dwd/data';
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
  const deletion = requests.find(
    (request) => request.kind === 'deletion' && request.status !== 'completed',
  );
  const [preferences, events] = await Promise.all([
    getNotificationPreferences(client).catch(() => null),
    getMyNotificationEvents(client).catch((): NotificationEvent[] => []),
  ]);
  return (
    <main id="main-content" className="page-shell">
      <header className="topbar">
        <Wordmark />
        <Link className="text-link" href="/home">
          Home
        </Link>
      </header>
      <section className="stack-lg">
        <h1>Your account.</h1>
        <Card className="stack">
          <h2>Your profile</h2>
          <DisplayNameForm initialName={profile?.display_name ?? ''} />
          <p className="muted small">
            Changes apply to active nights. Past nights keep the name you used then.
          </p>
        </Card>
        <Card className="stack">
          {preferences ? (
            <NotificationSettings initialPreferences={preferences} initialEvents={events} />
          ) : (
            <>
              <h2>Notifications</h2>
              <p className="error-box" role="alert">
                Notification settings could not load.{' '}
                <Link className="text-link" href="/account">
                  Retry
                </Link>
              </p>
              <NotificationInbox initialEvents={events} />
            </>
          )}
        </Card>
        <Card className="stack">
          <h2>Your requests</h2>
          {result.error ? (
            <p role="alert">
              Requests could not be loaded.{' '}
              <Link href="/account" className="text-link">
                Retry
              </Link>
            </p>
          ) : requests.length === 0 ? (
            <p className="muted small">No requests yet.</p>
          ) : (
            requests.map((request) => (
              <article className="stack request-record" key={request.id}>
                <div className="row-between">
                  <strong>
                    {request.kind === 'deletion'
                      ? 'Account deletion'
                      : request.kind === 'problem'
                        ? 'Problem report'
                        : 'Feedback'}
                  </strong>
                  <span className="pill">{request.status.replace('_', ' ')}</span>
                </div>
                <p className="muted small">
                  {new Date(request.created_at).toLocaleDateString('en')} · {request.id}
                </p>
                {request.response && <p className="support-response">{request.response}</p>}
              </article>
            ))
          )}
          <Link href="/feedback" className="text-link">
            Send feedback or report a problem
          </Link>
        </Card>
        <Card className="stack">
          <h2>App tour</h2>
          <TourButton className="button button-secondary" />
        </Card>
        <Card className="stack">
          <h2>Request account deletion</h2>
          <p>
            Your request goes to the app operator for review. Your account stays usable until it is
            processed.
          </p>
          <p className="muted small">
            Shared nights contain other people’s records too. Submitting a request does not erase
            those nights or your past entries from their summaries. The operator must review what
            personal data can be removed or anonymised while handling shared records. Any response
            appears above; no completion date is promised.
          </p>
          <p className="muted small">
            Before sharing this device, save or remove any entries waiting to save and discard
            unfinished night setup.
          </p>
          {deletion ? (
            <p className="notice-box">
              You already have an open deletion request. Reference: {deletion.id}
            </p>
          ) : (
            <RequestForm deletion />
          )}
        </Card>
        <Link href="/privacy" className="text-link">
          Privacy notice
        </Link>
      </section>
    </main>
  );
}
