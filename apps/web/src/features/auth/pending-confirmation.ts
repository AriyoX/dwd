import 'server-only';

import { cookies } from 'next/headers';
import { z } from 'zod';

const cookieName = 'dwd-pending-confirmation';
const pendingSchema = z.object({ email: z.email().max(254), retryAt: z.number() });

export async function rememberConfirmation(email: string, retryAt = 0) {
  (await cookies()).set(cookieName, JSON.stringify({ email, retryAt }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 3600,
  });
}

export async function readPendingConfirmation() {
  const value = (await cookies()).get(cookieName)?.value;
  try {
    return pendingSchema.parse(JSON.parse(value ?? 'null'));
  } catch {
    return null;
  }
}

export async function clearPendingConfirmation() {
  (await cookies()).delete(cookieName);
}
