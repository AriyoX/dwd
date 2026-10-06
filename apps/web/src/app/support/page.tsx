import type { Metadata } from 'next';
import Link from 'next/link';
import { LEGAL_CONTACT } from '@dwd/core';
import { Wordmark } from '@/components/layout/wordmark';
export const metadata: Metadata = { title: 'Support' };
export default function SupportPage() {
  return (
    <main className="page-shell" id="main-content">
      <header className="topbar">
        <Wordmark />
      </header>
      <article className="legal-copy">
        <h1>DWD support</h1>
        <p>
          Contact {LEGAL_CONTACT.name} for help, privacy requests, account deletion or reports of
          harmful content.
        </p>
        <p>
          <a className="text-link" href={`mailto:${LEGAL_CONTACT.email}`}>
            {LEGAL_CONTACT.email}
          </a>
        </p>
        <p>
          For a content report, describe the night, user or photo and what happened. Keep passwords
          and active invitation links out of your message. Reports are reviewed by the operator;
          this inbox is not an emergency service.
        </p>
        <p>
          <Link className="text-link" href="/delete-account">
            Request account deletion
          </Link>
        </p>
        <p>
          <Link className="text-link" href="/privacy">
            Privacy policy
          </Link>{' '}
          ·{' '}
          <Link className="text-link" href="/terms">
            Terms of service
          </Link>
        </p>
      </article>
    </main>
  );
}
