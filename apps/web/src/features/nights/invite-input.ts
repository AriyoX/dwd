import { inviteTokenSchema } from '@dwd/core';

export function parseInviteInput(value: string): string | null {
  const input = value.trim();
  if (inviteTokenSchema.safeParse(input).success) return input;
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const token =
      url.pathname.match(/^\/join\/([^/]+)\/?$/)?.[1] ??
      (url.pathname === '/' ? url.searchParams.get('join') : null);
    return token !== null && inviteTokenSchema.safeParse(token).success ? token : null;
  } catch {
    return null;
  }
}
