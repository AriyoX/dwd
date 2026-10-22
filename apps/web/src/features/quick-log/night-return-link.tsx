'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { quickScope, quickSessionForNight } from '@dwd/core';
import { browserQuickStore } from './local';

export function QuickNightReturnLink({
  accountId,
  nightId,
  memberId,
}: {
  accountId: string;
  nightId: string;
  memberId: string;
}) {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    const own = browserQuickStore(quickScope(accountId));
    const guest = browserQuickStore('guest');
    function update() {
      const session = quickSessionForNight(
        [
          ...own.getSnapshot().record.sessions,
          ...guest
            .getSnapshot()
            .record.sessions.filter((item) => !item.claimedBy || item.claimedBy === accountId),
        ],
        nightId,
        memberId,
      );
      setHref(
        session
          ? `/quick-log?scope=${session.scope === 'guest' ? 'guest' : 'account'}&sessionId=${session.id}`
          : null,
      );
    }
    queueMicrotask(update);
    const offOwn = own.subscribe(update);
    const offGuest = guest.subscribe(update);
    return () => {
      offOwn();
      offGuest();
    };
  }, [accountId, nightId, memberId]);
  return href ? (
    <Link replace className="button button-ghost" href={href}>
      Back to Quick Log
    </Link>
  ) : null;
}
