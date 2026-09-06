import type { Metadata } from 'next';
import Link from 'next/link';
import { Wordmark } from '@/components/layout/wordmark';

export const metadata: Metadata = { title: 'Privacy' };

export default function PrivacyPage() {
  return (
    <main className="page-shell" id="main-content">
      <header className="topbar">
        <Wordmark />
      </header>
      <article className="legal-copy">
        <p className="eyebrow">Draft · legal review required</p>
        <h1>Privacy notice</h1>
        <p>
          Drink with Desire stores account details, shared-night membership, personal plans, drink
          and water entries, alerts, invitation metadata, and security audit events needed to run
          the service.
        </p>
        <h2>What we do not collect</h2>
        <p>
          The MVP does not collect GPS, exact birth dates, weight, medication details, health
          information, advertising identifiers, or analytics-SDK data.
        </p>
        <h2>Sharing</h2>
        <p>
          Current members can see shared-night status. They cannot edit another account participant.
          A host can manage only guests that do not have accounts. Email addresses are not shown to
          participants.
        </p>
        <h2>Local queue</h2>
        <p>
          Small pending log payloads may be kept in this browser until they sync. Remove failed
          items from the night screen to delete them from this device.
        </p>
        <p className="warning-box">
          This placeholder must be reviewed and replaced by counsel before production launch.
        </p>
        <Link href="/" style={{ color: 'var(--amber)' }}>
          Back to Drink with Desire
        </Link>
      </article>
    </main>
  );
}
