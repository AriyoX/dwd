'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { browserQuickOffer } from './local';
export function QuickReturnLink({ accountId }: { accountId: string | null }) {
  const [scope, setScope] = useState('guest');
  useEffect(() => {
    queueMicrotask(() => {
      const offer = accountId ? browserQuickOffer(accountId) : null;
      setScope(offer?.scope === 'guest' || !accountId ? 'guest' : 'account');
    });
  }, [accountId]);
  return (
    <Link className="button button-ghost" href={`/quick-log?scope=${scope}`}>
      Back to Quick Log
    </Link>
  );
}
