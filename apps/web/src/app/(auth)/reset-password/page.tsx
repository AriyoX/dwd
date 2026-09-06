import type { Metadata } from 'next';
import Link from 'next/link';
import { PasswordRecoveryForm } from '@/features/auth/password-recovery-form';
import { getAuthenticatedUserId } from '@/lib/supabase/server';
import { safeReturnPath } from '@/lib/navigation';

export const metadata: Metadata = { title: 'New password' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const returnPath = safeReturnPath(next);
  if ((await getAuthenticatedUserId()) === null)
    return (
      <section className="stack-lg">
        <h1>Request a new link.</h1>
        <p className="muted">Your reset link has expired or is missing.</p>
        <Link
          className="button button-primary"
          href={`/forgot-password?next=${encodeURIComponent(returnPath)}`}
        >
          Reset password
        </Link>
      </section>
    );
  return (
    <section className="stack-lg">
      <h1>Choose a new password.</h1>
      <PasswordRecoveryForm reset next={returnPath} />
    </section>
  );
}
