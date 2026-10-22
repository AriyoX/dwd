import { publicMetadata } from '@/lib/public-metadata';
import { CalendarDays } from 'lucide-react';
import { PublicHeader, PublicFooter } from '@/components/layout/public-layout';
import { EventCard } from '@/features/events/event-card';
import { getAuthenticatedUserId } from '@/lib/supabase/server';
import styles from '@/components/layout/public-pages.module.css';

export const metadata = publicMetadata(
  'Events',
  'Events and shared photo memories with DWD.',
  '/events',
);

export default async function EventsPage() {
  const userId = await getAuthenticatedUserId().catch(() => null);
  return (
    <div className={styles['page']}>
      <PublicHeader signedIn={Boolean(userId)} />
      <main id="main-content" className={styles['eventsMain']}>
        <header className={styles['eventsHeading']}>
          <h1>
            Good company.
            <br />
            <em>Great memories.</em>
          </h1>
        </header>
        <section className={styles['upcoming']} aria-labelledby="upcoming-events">
          <CalendarDays size={24} aria-hidden="true" />
          <h2 id="upcoming-events">No upcoming events</h2>
        </section>
        <section aria-labelledby="past-events" className={styles['pastEvents']}>
          <div className={styles['sectionHeading']}>
            <h2 id="past-events">Past events</h2>
            <span>01</span>
          </div>
          <EventCard eager />
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
