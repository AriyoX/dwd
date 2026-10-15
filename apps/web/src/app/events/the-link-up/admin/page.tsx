import type { Metadata } from 'next';
import Link from 'next/link';
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
      <Link href="/events/the-link-up">← The Link Up</Link>
      <h1>Organizer dashboard</h1>
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
          Organizer access could not connect. Check the photo-sharing configuration and try again.
        </p>
      )}
    </main>
  );
}
