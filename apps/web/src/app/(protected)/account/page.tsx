import Link from 'next/link';
import { Wordmark } from '@/components/layout/wordmark';
import { Card } from '@/components/ui/card';
import { RequestForm } from '@/features/support/request-form';
import { ResetDemoButton } from '@/features/demo/reset-demo-button';
import { createServerSupabaseClient } from '@/lib/supabase/server';
export const metadata = { title: 'Your account' };
export default async function AccountPage() {
  const client = await createServerSupabaseClient();
  const result = await client
    .from('support_requests')
    .select('id, kind, status, response, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  const requests = result.data ?? [];
  const deletion = requests.find(
    (request) => request.kind === 'deletion' && request.status !== 'completed',
  );
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
          <h2>Demo data</h2>
          <p className="muted small">
            Demo data is stored only in this browser. Resetting it leaves real nights, unfinished
            setup, and queued entries intact.
          </p>
          <ResetDemoButton />
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
            Queued entries and unfinished setup on this device are separate. Sync or remove queued
            entries from each night and discard unfinished setup before handing this device to
            someone else.
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
