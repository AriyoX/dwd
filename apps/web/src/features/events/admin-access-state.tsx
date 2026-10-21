import Link from 'next/link';
import { LockKeyhole, RefreshCw } from 'lucide-react';
import { AdminHeader } from './admin-header';
import styles from './photo-sharing.module.css';

export function AdminAccessState({
  unavailable = false,
  event = false,
}: {
  unavailable?: boolean;
  event?: boolean;
}) {
  return (
    <main id="main-content" className={styles['admin']}>
      <AdminHeader title="Events admin" restricted />
      <section className={styles['adminAccessState']} aria-labelledby="admin-access-title">
        <span className={styles['accessIcon']}>
          {unavailable ? (
            <RefreshCw size={24} aria-hidden="true" />
          ) : (
            <LockKeyhole size={24} aria-hidden="true" />
          )}
        </span>
        <h2 id="admin-access-title">
          {unavailable ? 'Couldn’t check access' : 'Access restricted'}
        </h2>
        <p role={unavailable ? 'alert' : undefined}>
          {unavailable
            ? 'Refresh the page to try again.'
            : event
              ? 'This account doesn’t have access to The Link Up dashboard.'
              : 'This account doesn’t have access to events admin.'}
        </p>
        <Link href="/login?next=%2Fevents%2Fadmin" className={styles['primaryButton']}>
          Sign in with another account
        </Link>
      </section>
    </main>
  );
}
