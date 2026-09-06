import type { NightAlert, NightSnapshot } from '@dwd/core';

export function visibleAlerts(snapshot: NightSnapshot): NightAlert[] {
  return snapshot.alerts.filter((alert) => {
    if (alert.visibility === 'group') return true;
    const member = snapshot.members.find((candidate) => candidate.id === alert.nightMemberId);
    return (
      member?.userId === snapshot.currentUserId ||
      member?.managedByUserId === snapshot.currentUserId
    );
  });
}
