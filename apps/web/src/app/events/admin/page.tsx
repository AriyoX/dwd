import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, CalendarDays, Images } from 'lucide-react';
import { forbidden, redirect } from 'next/navigation';
import { accessibleAdminEvents } from '@/lib/events/admin-events';
import { PageAccessError } from '@/lib/auth/page-access';
import { AdminHeader } from '@/features/events/admin-header';
import { AdminAccessState } from '@/features/events/admin-access-state';
import styles from '@/features/events/photo-sharing.module.css';

export const metadata: Metadata = {
  title: 'Events admin · DWD',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
export const viewport: Viewport = { themeColor: '#f5f6f8', colorScheme: 'light' };

export default async function EventsAdminPage() {
  let portal: Awaited<ReturnType<typeof accessibleAdminEvents>> | null = null;
  let access: 'allowed' | 'sign-in' | 'denied' | 'unavailable' = 'unavailable';
  try {
    portal = await accessibleAdminEvents();
    access = 'allowed';
  } catch (error) {
    if (error instanceof PageAccessError)
      access = error.status === 401 ? 'sign-in' : error.status === 403 ? 'denied' : 'unavailable';
  }
  if (access === 'sign-in') redirect('/login?next=%2Fevents%2Fadmin');
  if (access === 'denied') forbidden();
  if (!portal) return <AdminAccessState unavailable />;
  const { user, events } = portal;
  return (
    <main id="main-content" className={styles['admin']}>
      <AdminHeader title="Events admin" email={user.email} />
      <div className={styles['portalSectionHeading']}>
        <h2>Your events</h2>
        <span className={styles['countBadge']}>
          {events.length} {events.length === 1 ? 'event' : 'events'}
        </span>
      </div>
      {events.length ? (
        <nav aria-label="Your events" className={styles['eventAdminGrid']}>
          {events.map((event) => (
            <Link
              key={event.path}
              href={event.path}
              className={styles['eventAdminCard']}
              aria-label={event.title}
            >
              <div className={styles['eventAdminArtwork']}>
                <Image
                  src="/events/the-link-up/foliage.webp"
                  alt=""
                  fill
                  sizes="(max-width: 640px) 100vw, 560px"
                  className={styles['portalFoliage']}
                  loading="eager"
                />
                <Image
                  src="/events/the-link-up/wordmark.webp"
                  alt=""
                  width={698}
                  height={368}
                  className={styles['portalWordmark']}
                  loading="eager"
                />
              </div>
              <div className={styles['eventAdminBody']}>
                <div className={styles['eventAdminTitle']}>
                  <h3>{event.title}</h3>
                  <ArrowUpRight size={20} aria-hidden="true" />
                </div>
                <p className={styles['eventAdminDate']}>
                  <CalendarDays size={15} aria-hidden="true" />
                  {new Intl.DateTimeFormat('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    timeZone: 'Africa/Kampala',
                  }).format(new Date(event.date + 'T12:00:00Z'))}
                </p>
                <dl className={styles['eventAdminStats']}>
                  <div>
                    <dt>Visible photos</dt>
                    <dd>{event.visiblePhotos}</dd>
                  </div>
                  <div>
                    <dt>Hidden photos</dt>
                    <dd>{event.hiddenPhotos}</dd>
                  </div>
                </dl>
                <div className={styles['eventAdminFooter']}>
                  <div className={styles['eventAdminStatuses']}>
                    <span className={event.uploadsEnabled ? styles['badge'] : styles['badgeMuted']}>
                      Uploads {event.uploadsEnabled ? 'open' : 'paused'}
                    </span>
                    <span className={event.galleryEnabled ? styles['badge'] : styles['badgeMuted']}>
                      Gallery {event.galleryEnabled ? 'open' : 'closed'}
                    </span>
                  </div>
                  <span className={styles['eventAdminOpen']}>
                    Open dashboard <ArrowUpRight size={15} aria-hidden="true" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </nav>
      ) : (
        <div className={styles['dashboardCard']}>
          <Images size={24} aria-hidden="true" />
          <p>No event dashboards assigned.</p>
        </div>
      )}
    </main>
  );
}
