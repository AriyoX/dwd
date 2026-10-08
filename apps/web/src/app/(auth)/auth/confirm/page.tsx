import { ConfirmationSession } from '@/features/auth/confirmation-session';
import { safeReturnPath } from '@/lib/navigation';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Confirming your email', referrer: 'no-referrer' };
export const dynamic = 'force-dynamic';

export default async function ConfirmationSessionPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string;
    code?: string;
    sb_flow_id?: string;
    token_hash?: string;
    type?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const next = safeReturnPath(params.next);
  if (params.code || params.token_hash || params.error) {
    const query = new URLSearchParams({ next });
    for (const key of ['code', 'sb_flow_id', 'token_hash', 'type', 'error'] as const) {
      const value = params[key];
      if (typeof value === 'string') query.set(key, value);
    }
    redirect(`/auth/confirm/verify?${query.toString()}`);
  }
  // Render directly at the email's destination. An extra redirect can discard
  // the implicit session fragment in WebKit before the browser can read it.
  return <ConfirmationSession next={next} />;
}
