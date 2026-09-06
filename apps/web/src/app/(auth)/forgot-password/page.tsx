import type { Metadata } from 'next';
import { PasswordRecoveryForm } from '@/features/auth/password-recovery-form';
import { safeReturnPath } from '@/lib/navigation';

export const metadata: Metadata = { title: 'Reset password' };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <section className="stack-lg">
      <h1>Forgot your password?</h1>
      <p className="muted">We’ll email you a link to reset it.</p>
      <PasswordRecoveryForm next={safeReturnPath(next)} />
    </section>
  );
}
