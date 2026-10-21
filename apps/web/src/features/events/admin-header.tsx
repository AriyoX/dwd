import Link from 'next/link';
import { ArrowUpRight, CalendarDays } from 'lucide-react';
import { SignOutButton } from '@/features/auth/sign-out-button';
import styles from './photo-sharing.module.css';

export function AdminHeader({
  title,
  email,
  event = false,
  restricted = false,
}: {
  title: string;
  email?: string | undefined;
  event?: boolean;
  restricted?: boolean;
}) {
  return (
    <header className={styles['adminHeader']}>
      <div className={styles['adminHeading']}>
        <span className={styles['adminBrand']}>
          <CalendarDays size={17} aria-hidden="true" /> DWD Events{event ? ' / The Link Up' : ''}
        </span>
        <h1>{title}</h1>
        {email && <p className={styles['adminIdentity']}>{email}</p>}
      </div>
      <nav aria-label="Admin links" className={styles['adminNav']}>
        {event && !restricted && (
          <Link href="/events/admin" className={styles['adminNavLink']}>
            All events <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        )}
        {event && !restricted && (
          <Link href="/events/the-link-up" className={styles['adminNavLink']}>
            View event <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        )}
        <Link href="/" className={styles['adminNavLink']}>
          Go to DWD <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
        <SignOutButton className={styles['adminNavLink']} />
      </nav>
    </header>
  );
}
