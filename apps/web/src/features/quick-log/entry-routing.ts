import { inviteTokenSchema } from '@dwd/core';
/** Invitations take precedence even for returning accounts; null means render the landing page. */
export function quickEntryDestination(accountId: string | null, join?: unknown): string | null {
  if (join !== undefined) {
    const token = inviteTokenSchema.safeParse(join);
    return `/join/${token.success ? encodeURIComponent(token.data) : 'invalid'}`;
  }
  return accountId ? '/home' : null;
}
