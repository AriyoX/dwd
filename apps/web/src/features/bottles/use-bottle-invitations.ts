'use client';

import { useEffect, useState } from 'react';
import type { MemberSnapshot, NightSnapshot } from '@dwd/core';
import { availableBottles } from './bottle-shelf';

export function useBottleInvitations(snapshot: NightSnapshot, member: MemberSnapshot) {
  const storageKey = `dwd:bottle-invitations:${snapshot.currentUserId}:${member.id}`;
  const [seen, setSeen] = useState<{ key: string; ids: string[] }>({ key: '', ids: [] });
  useEffect(() => {
    let ids: string[] = [];
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? '[]');
      if (Array.isArray(saved)) ids = saved.filter((id): id is string => typeof id === 'string');
    } catch {
      /* Prompts still work when browser storage is unavailable. */
    }
    queueMicrotask(() => setSeen({ key: storageKey, ids }));
  }, [storageKey]);
  const candidates = availableBottles(snapshot, member.id).filter(
    (bottle) =>
      !bottle.closedAt &&
      bottle.remainingMl > 0 &&
      !bottle.joinedMemberIds.includes(member.id) &&
      !member.planItems.some((item) => item.sharedBottleId === bottle.id),
  );
  const next =
    seen.key === storageKey
      ? candidates.find((bottle) => !seen.ids.includes(bottle.id))
      : undefined;
  function dismiss(id: string) {
    const ids = [...seen.ids, id];
    setSeen({ key: storageKey, ids });
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(ids));
    } catch {
      /* Keep in memory. */
    }
  }
  return { next, dismiss };
}
