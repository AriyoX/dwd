'use client';
import { useSyncExternalStore } from 'react';
import styles from './photo-sharing.module.css';

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

export function PhotoConnectionNotice() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  if (online) return null;
  return (
    <p role="status" className={styles['connectionNotice']}>
      You’re offline. Check your connection, then refresh the page.
    </p>
  );
}
