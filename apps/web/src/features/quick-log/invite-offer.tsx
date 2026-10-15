'use client';
import Link from 'next/link';
import { useState } from 'react';
import { availableQuickEntries, quickCountLabel } from '@dwd/core';
import { browserQuickOffer, browserQuickStore } from './local';
import { Button } from '@/components/ui/button';

export function QuickInviteOffer({
  nightId,
  nightTitle,
  accountId,
  onNotNow,
}: {
  nightId: string;
  nightTitle: string;
  accountId: string;
  onNotNow: () => void;
}) {
  const [offer] = useState(() => browserQuickOffer(accountId));
  if (!offer)
    return (
      <Button type="button" onClick={onNotNow}>
        Open night
      </Button>
    );
  const quick = browserQuickStore(offer.scope).session(offer.sessionId);
  return (
    <div className="stack">
      <h2>
        Add your {quickCountLabel(availableQuickEntries(quick))} to {nightTitle}?
      </h2>
      <p className="muted small">New drinks will use this night’s plan.</p>
      <Link
        replace
        className="button button-primary"
        href={`/quick-log/add?scope=${offer.scope === 'guest' ? 'guest' : 'account'}&sessionId=${offer.sessionId}&nightId=${nightId}`}
      >
        Add logs
      </Link>
      <Button type="button" variant="secondary" onClick={onNotNow}>
        Not now
      </Button>
    </div>
  );
}
