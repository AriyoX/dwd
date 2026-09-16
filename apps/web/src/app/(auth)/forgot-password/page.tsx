import type { Metadata } from 'next';
import { PasswordRecoveryForm } from '@/features/auth/password-recovery-form';
import { safeReturnPath } from '@/lib/navigation';

export const metadata: Metadata = { title: 'Reset password' };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <section className="stack-lg">
      <h1>Forgot your password?</h1>
      {error === 'expired' && (
        <p className="warning-box" role="alert">
          This reset link has expired or was already used. Request a new one.
        </p>
      )}
      <p className="muted">We’ll email you a link to reset it.</p>
      <PasswordRecoveryForm next={safeReturnPath(next)} />
    </section>
  );
}
