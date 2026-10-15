'use client';

import { useSearchParams } from 'next/navigation';
import type { QuickLogStore } from '@dwd/contracts';
import { Wordmark } from '@/components/layout/wordmark';
import { Button } from '@/components/ui/button';
import { AccountBenefits, GetApp } from './account-benefits';
import { useBrowserQuickLog, useQuickStoreState } from './provider';
import styles from './quick-log.module.css';

export function QuickLogHeader() {
  const { store, session, writable } = useBrowserQuickLog();
  return (
    <header className={`topbar ${styles['quickHeader']}`}>
      <Wordmark />
      <div className={styles['headerActions']}>
        {!session ? (
          store ? (
            <GuestSignIn store={store} writable={writable} />
          ) : (
            <Button type="button" variant="ghost" disabled>
              Sign in
            </Button>
          )
        ) : null}
        <GetApp />
      </div>
    </header>
  );
}

function GuestSignIn({ store, writable }: { store: QuickLogStore; writable: boolean }) {
  useQuickStoreState(store);
  const params = useSearchParams();
  const current = store.session(params.get('sessionId'));
  return (
    <AccountBenefits
      next={`/quick-log?scope=account${current ? `&sessionId=${current.id}` : ''}`}
      beforeAuth={() =>
        store.getSnapshot().record.sessions.length && !store.getSnapshot().saved
          ? 'Save your logs on this device before signing in. They are still here.'
          : null
      }
      retrySaving={() => {
        if (writable) store.retrySave();
      }}
    />
  );
}
