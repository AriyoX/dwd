import Link from 'next/link';
import { Wordmark } from '@/components/layout/wordmark';
import { Card } from '@/components/ui/card';
import { RequestForm } from '@/features/support/request-form';
export const metadata = { title: 'Feedback & support' };
export default function FeedbackPage() {
  return (
    <main id="main-content" className="page-shell">
      <header className="topbar">
        <Wordmark />
        <Link className="text-link" href="/home">
          Home
        </Link>
      </header>
      <section className="stack-lg">
        <h1>Feedback & support.</h1>
        <Card className="stack">
          <RequestForm />
        </Card>
        <p className="muted small">
          Reports are saved privately for the app operator to review. Check your account for
          responses; this does not send an email or provide live support.
        </p>
        <Link className="text-link" href="/account">
          Your requests
        </Link>
      </section>
    </main>
  );
}
