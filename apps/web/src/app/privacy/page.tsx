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
        <h1>Privacy notice</h1>
        <p>
          DWD (Drink with Desire) keeps a shared record of a night out. This notice describes the
          app’s current behavior.
        </p>
        <h2>Account and night data</h2>
        <p>
          Supabase handles your email, password authentication, sessions, and email confirmation.
          DWD stores your display name and adult confirmation, night membership, plans, alcohol and
          water entries, corrections, alerts, invitation metadata, and audit events. Vercel hosts
          the website; Supabase provides the database and live updates. Hosting and authentication
          providers also process technical request information needed to operate their services.
        </p>
        <h2>Who can see your night</h2>
        <p>
          Current account members can see the shared night and its summary, including participant
          names, plans, and entries. After leaving, account members can see only their own activity
          in the finished night’s history. Personal alerts are limited by their visibility rules.
          Email addresses are not shown to other participants. A host can manage entries for guests
          without accounts, but cannot edit another account participant’s plan or logs. Ask someone
          before tracking for them.
        </p>
        <p>
          Anyone holding a valid invitation link can see the night name, host name, and times before
          joining. Treat links as private. Hosts can replace or revoke them. Invitations are stored
          on the server as token hashes.
        </p>
        <h2>On this device</h2>
        <p>
          Authentication uses cookies. Pending drink and water entries are stored in this browser
          for retry and separated by account and night. Signing out does not erase those entries.
          Remove unwanted pending entries from the night or summary screen.
        </p>
        <p>
          Unfinished night setup is saved in browser storage for the account that started it,
          including guest names, plans, and the invitation request needed for safe retries. Use
          Discard setup to remove it. Temporary invitation operations use session storage. These
          browser records are not encrypted by DWD; use a trusted device.
        </p>
        <p>
          DWD remembers that you have seen the app tour in your account and on this device. Your
          light or dark theme preference is saved on this device.
        </p>
        <h2>Notifications</h2>
        <p>
          DWD stores notification preferences, check-in requests, reminders, and read status. If you
          enable browser notifications, it also stores this device’s push subscription to deliver
          updates through your browser’s push provider. Push messages use generic text; open DWD to
          see the details. Turn off this device’s push delivery in Your account. You can change
          browser permission in your browser settings. Signing out removes this device’s
          registration when connected. Delayed or unverified pushes show a generic update with no
          private night link.
        </p>
        <h2>Feedback and deletion requests</h2>
        <p>
          Reports and deletion requests store your account identifier, the text you submit, request
          status, and any operator response. You can see your own requests; other night members
          cannot. The app operator reviews requests through the backend. No screenshots or
          diagnostics are attached automatically, and submitting a request does not send an email.
        </p>
        <p>
          Request account deletion in Your account. A request does not immediately delete your
          account, shared records, or local data. Shared nights include other people’s records, so
          the operator must review removal or anonymisation and communicate the outcome in your
          request. The app does not specify a deletion turnaround or a fixed data-retention period.
        </p>
        <h2>Collection limits</h2>
        <p>
          DWD does not request GPS, exact birth dates, weight, or medication details, and does not
          include advertising or analytics SDKs. Avoid putting sensitive information in display
          names, night names, or reports. Drink entries themselves may reveal personal habits.
        </p>
        <p>
          <Link className="text-link" href="/feedback">
            Feedback & support
          </Link>{' '}
          ·{' '}
          <Link className="text-link" href="/account">
            Your account and requests
          </Link>
        </p>
        <Link className="text-link" href="/">
          Back to DWD
        </Link>
      </article>
    </main>
  );
}
