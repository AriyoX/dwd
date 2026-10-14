'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { quickCountLabel, quickScope } from '@dwd/core';
import { ArrowRight, Plus } from 'lucide-react';
import { browserQuickStore } from './local';
export function QuickLogEntry({ accountId }: { accountId?: string }) {
  const [entry, setEntry] = useState({ resume: false, guest: false, counts: '' });
  useEffect(() => {
    function update() {
      const own = browserQuickStore(quickScope(accountId));
      const guest = browserQuickStore('guest');
      own.reload();
      guest.reload();
      const current = own.session() ?? guest.session();
      setEntry({
        resume: Boolean(current),
        guest: Boolean(current && current.scope === 'guest' && accountId),
        counts: current ? quickCountLabel(current.entries) : '',
      });
    }
    queueMicrotask(update);
    window.addEventListener('focus', update);
    return () => window.removeEventListener('focus', update);
  }, [accountId]);
  return (
    <Link className="resume-card" href={entry.guest ? '/quick-log?scope=guest' : '/quick-log'}>
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
