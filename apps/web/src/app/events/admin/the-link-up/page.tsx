import type { Metadata, Viewport } from 'next';
import { forbidden, redirect } from 'next/navigation';
import { requireOrganizer, LINK_UP_ADMIN_PATH } from '@/lib/link-up/organizer';
import { PageAccessError } from '@/lib/auth/page-access';
import { PhotoAdmin } from '@/features/events/photo-admin';
import { AdminHeader } from '@/features/events/admin-header';
import { AdminAccessState } from '@/features/events/admin-access-state';
import styles from '@/features/events/photo-sharing.module.css';

export const metadata: Metadata = {
  title: 'The Link Up · Organizers',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
export const viewport: Viewport = { themeColor: '#f5f6f8', colorScheme: 'light' };
export default async function OrganizerPage() {
  let email: string | undefined;
  let access: 'allowed' | 'sign-in' | 'denied' | 'unavailable' = 'unavailable';
  try {
    email = (await requireOrganizer()).email;
    access = 'allowed';
  } catch (error) {
    if (error instanceof PageAccessError)
      access = error.status === 401 ? 'sign-in' : error.status === 403 ? 'denied' : 'unavailable';
  }
  if (access === 'sign-in') redirect(`/login?next=${encodeURIComponent(LINK_UP_ADMIN_PATH)}`);
  if (access === 'denied') forbidden();
  if (access === 'unavailable') return <AdminAccessState unavailable />;
  return (
    <main id="main-content" className={styles['admin']}>
      <AdminHeader title="Photo dashboard" email={email} event />
      <PhotoAdmin />
    </main>
  );
}
