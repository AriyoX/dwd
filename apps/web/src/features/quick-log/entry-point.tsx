'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { quickCountLabel, quickScope, quickLinkedNight } from '@dwd/core';
import { ArrowRight, Plus } from 'lucide-react';
import { browserQuickStore } from './local';
import styles from './quick-log.module.css';
export function QuickLogEntry({
  accountId,
  resumeOnly = false,
}: {
  accountId?: string;
  resumeOnly?: boolean;
}) {
  const [entry, setEntry] = useState({ resume: false, guest: false, counts: '' });
  useEffect(() => {
    function update() {
      const own = browserQuickStore(quickScope(accountId));
      const guest = browserQuickStore('guest');
      const current = own.session() ?? (guest.session()?.claimedBy ? undefined : guest.session());
      setEntry({
        resume: Boolean(current),
        guest: Boolean(current && current.scope === 'guest' && accountId),
        counts: current
          ? quickLinkedNight(current)
            ? 'Linked to your night'
            : quickCountLabel(current.entries)
          : '',
      });
    }
    queueMicrotask(update);
    window.addEventListener('focus', update);
    const own = browserQuickStore(quickScope(accountId)),
      guest = browserQuickStore('guest');
    const offOwn = own.subscribe(update),
      offGuest = guest.subscribe(update);
    return () => {
      window.removeEventListener('focus', update);
      offOwn();
      offGuest();
    };
  }, [accountId]);
  if (resumeOnly && !entry.resume) return null;
  return (
    <Link
      className={`resume-card ${styles['entryCard']}`}
      href={entry.guest ? '/quick-log?scope=guest' : '/quick-log'}
    >
      <span className="card-icon" style={{ margin: 0 }}>
        <Plus size={24} aria-hidden="true" />
      </span>
      <div>
        <strong>{entry.resume ? 'Resume Quick Log' : 'Quick Log'}</strong>
        {entry.counts ? (
          <span className="muted small">
            {entry.counts}
            {entry.guest ? ' · Guest session' : ''}
          </span>
        ) : null}
      </div>
      <ArrowRight size={20} aria-hidden="true" />
    </Link>
  );
}
