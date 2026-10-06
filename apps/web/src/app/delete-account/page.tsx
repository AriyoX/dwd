import type { Metadata } from 'next';
import Link from 'next/link';
import { LEGAL_CONTACT } from '@dwd/core';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AccountDeletion } from '@/features/account/account-deletion';
import { Wordmark } from '@/components/layout/wordmark';
export const metadata: Metadata = { title: 'Delete account' };
export const dynamic = 'force-dynamic';

export default async function DeleteAccountPage() {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.auth.getClaims();
  const signedIn = !error && Boolean(data?.claims.sub);
  const deletion = signedIn
    ? await client.from('account_deletions').select('delete_after,status').maybeSingle()
    : null;
  return (
    <main className="page-shell" id="main-content">
      <header className="topbar">
        <Wordmark />
      </header>
      <article className="legal-copy">
        <h1>Delete your DWD account</h1>
        <p>
          You can request deletion here without installing the app. In the mobile app, open Account
          → Delete account.
        </p>
        {signedIn ? (
          <AccountDeletion initialDeletion={deletion?.data ?? null} expanded />
        ) : (
          <p>
            <Link className="button button-danger" href="/login?next=%2Fdelete-account">
              Sign in to request deletion
            </Link>
          </p>
        )}
        <h2>What happens</h2>
        <p>
          Confirm deletion to schedule it for 30 days later. You will be signed out. A fresh sign-in
          before deletion starts cancels it; a session refresh does not. Once processing starts, it
          cannot be cancelled.
        </p>
        <p>
          Deletion removes your login, profile, uploaded photos, personal plans and entries, support
          messages, private messages, preferences and notification data. Nights you host are closed.
          Other participants’ records and a minimal “Deleted user” membership/shared timeline
          remain; your personal entries do not.
        </p>
        <p>
          The worker runs hourly after the 30-day period and retries provider failures. Copies on
          other devices must be cleared on those devices. Provider backups and operational logs
          follow their configured retention periods, as explained in the{' '}
          <Link className="text-link" href="/privacy">
            privacy policy
          </Link>
          .
        </p>
        <h2>Cannot sign in?</h2>
        <p>
          Use password recovery or email{' '}
          <a
            className="text-link"
            href={`mailto:${LEGAL_CONTACT.email}?subject=DWD%20account%20deletion`}
          >
            {LEGAL_CONTACT.email}
          </a>{' '}
          from the address linked to your account. We may verify ownership; never send your
          password. You do not need to create another account.
        </p>
        <p>
          <Link className="text-link" href="/support">
            Support
          </Link>{' '}
          ·{' '}
          <Link className="text-link" href="/terms">
            Terms
          </Link>
        </p>
      </article>
    </main>
  );
}
