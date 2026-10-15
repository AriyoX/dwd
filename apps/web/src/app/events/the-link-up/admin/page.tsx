import type { Metadata } from 'next';
import Link from 'next/link';
import { requireOrganizer } from '@/lib/link-up/organizer';
import { PhotoError } from '@/lib/link-up/errors';
import { OrganizerSignIn, PhotoAdmin } from '@/features/events/photo-admin';
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
    if (error instanceof PhotoError)
      access = error.status === 401 ? 'sign-in' : error.status === 403 ? 'denied' : 'unavailable';
  }
  return (
    <main id="main-content" className={styles['admin']}>
      <Link href="/events/the-link-up">← The Link Up</Link>
      <h1>Organizer dashboard</h1>
      {access === 'allowed' && <PhotoAdmin />}
      {access === 'sign-in' && <OrganizerSignIn />}
      {access === 'denied' && (
        <>
          <p>
            This DWD account cannot manage The Link Up album. Sign in using your approved organizer
            account.
          </p>
          <Link href="/account">Manage your DWD sign-in</Link>
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
