import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, MessageCircle, MessagesSquare } from 'lucide-react';
import { Wordmark } from '@/components/layout/wordmark';
import { Card } from '@/components/ui/card';
import { RequestForm } from '@/features/support/request-form';
export const metadata = { title: 'Feedback & support' };
export default function FeedbackPage() {
  return (
    <main id="main-content" className="page-shell support-shell">
      <header className="topbar">
        <Wordmark />
        <Link className="back-link" href="/home">
          <ArrowLeft size={17} aria-hidden="true" /> Home
        </Link>
      </header>
      <section className="stack-lg">
        <header className="page-heading support-heading">
          <span className="settings-feature-icon">
            <MessagesSquare size={30} aria-hidden="true" />
          </span>
          <h1>
            What’s on your mind<span className="heading-dot">?</span>
          </h1>
        </header>
        <Card className="stack support-card">
          <RequestForm />
        </Card>
        <Link className="support-followup" href="/account#messages">
          <MessageCircle size={22} aria-hidden="true" />
          <span>
            <strong>Your messages</strong>
            <span className="muted small">
              Replies appear here, rather than by email. This isn’t live chat.
            </span>
          </span>
          <ArrowUpRight size={20} aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}
