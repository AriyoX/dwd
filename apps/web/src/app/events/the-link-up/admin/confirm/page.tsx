import { OrganizerConfirmation } from '@/features/events/organizer-confirm';
import styles from '@/features/events/photo-sharing.module.css';
export default function ConfirmOrganizerPage() {
  return (
    <main id="main-content" className={styles['admin']}>
      <h1>The Link Up</h1>
      <OrganizerConfirmation />
    </main>
  );
}
