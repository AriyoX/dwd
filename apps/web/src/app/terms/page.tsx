import type { Metadata } from 'next';
import Link from 'next/link';
import { Wordmark } from '@/components/layout/wordmark';

export const metadata: Metadata = { title: 'Terms' };

export default function TermsPage() {
  return (
    <main className="page-shell" id="main-content">
      <header className="topbar">
        <Wordmark />
      </header>
      <article className="legal-copy">
        <p className="eyebrow">Draft · legal review required</p>
        <h1>Terms of use</h1>
        <p>
          Drink with Desire is for adults tracking entries they choose to record during a shared
          night. It is not a drinking game, competition, medical device, BAC calculator, sobriety
          detector, or driving-safety tool.
        </p>
        <h2>No safety determination</h2>
        <p>
          Counts and alcohol equivalents are approximate. Never use Drink with Desire to decide
          whether anyone can drive, whether someone is sober, or whether emergency care is needed.
        </p>
        <h2>Emergencies</h2>
        <p>
          If someone cannot be awakened, is vomiting repeatedly, has a seizure, breathes slowly or
          irregularly, is severely confused, or has clammy or unusually cold skin, seek emergency
          help immediately and do not leave them alone.
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
