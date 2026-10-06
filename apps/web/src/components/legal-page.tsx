import Link from 'next/link';
import { LEGAL_UPDATED, LEGAL_CONTACT, type LegalDocument } from '@dwd/core';
import { Wordmark } from '@/components/layout/wordmark';

export function LegalPage({ document }: { document: LegalDocument }) {
  return (
    <main className="page-shell" id="main-content">
      <header className="topbar">
        <Wordmark />
      </header>
      <article className="legal-copy">
        <h1>{document.title}</h1>
        <p className="muted small">Updated {LEGAL_UPDATED}</p>
        <p>{document.introduction}</p>
        {document.sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
        <p>
          <a className="text-link" href={`mailto:${LEGAL_CONTACT.email}`}>
            Contact {LEGAL_CONTACT.name}
          </a>
        </p>
        <nav aria-label="Legal and support" className="row">
          <Link className="text-link" href="/privacy">
            Privacy
          </Link>
          <Link className="text-link" href="/terms">
            Terms
          </Link>
          <Link className="text-link" href="/delete-account">
            Delete account
          </Link>
          <Link className="text-link" href="/support">
            Support
          </Link>
        </nav>
        <Link className="text-link" href="/">
          Back to DWD
        </Link>
      </article>
    </main>
  );
}
