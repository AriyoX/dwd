import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { redirect } from 'next/navigation';
import { requireOrganizer, LINK_UP_ADMIN_PATH } from '@/lib/link-up/organizer';
import { PageAccessError } from '@/lib/auth/page-access';
import { PhotoAdmin } from '@/features/events/photo-admin';
import styles from '@/features/events/photo-sharing.module.css';

export const metadata: Metadata = {
  title: 'The Link Up · Organizers',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
export const viewport: Viewport = { themeColor: '#f5f6f8', colorScheme: 'light' };
export default async function OrganizerPage() {
  let access: 'allowed' | 'sign-in' | 'denied' | 'unavailable' = 'unavailable';
  try {
    await requireOrganizer();
    access = 'allowed';
  } catch (error) {
    if (error instanceof PageAccessError)
      access = error.status === 401 ? 'sign-in' : error.status === 403 ? 'denied' : 'unavailable';
  }
  if (access === 'sign-in') redirect(`/login?next=${encodeURIComponent(LINK_UP_ADMIN_PATH)}`);
  return (
    <main id="main-content" className={styles['admin']}>
      <header className={styles['adminHeader']}>
        <div>
          <p>The Link Up</p>
          <h1>Photo dashboard</h1>
        </div>
        <nav aria-label="Dashboard links" className={styles['buttonGroup']}>
          <Link href="/events/the-link-up">
            View event <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
          <Link href="/">
            Go to DWD <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        </nav>
      </header>
      {access === 'allowed' && <PhotoAdmin />}
      {access === 'denied' && (
        <>
          <p>This DWD account does not have access to The Link Up dashboard.</p>
          <Link href={`/login?next=${encodeURIComponent(LINK_UP_ADMIN_PATH)}`}>
            Sign in with another account
          </Link>
        </>
      )}
      {access === 'unavailable' && (
        <p role="alert">
          We couldn’t check your organizer access. Please refresh the page and try again.
        </p>
      )}
    </main>
  );
}
