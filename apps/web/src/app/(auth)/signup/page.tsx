import type { Metadata } from 'next';
import Link from 'next/link';
import { SignupForm } from '@/features/auth/auth-form';
import { safeReturnPath } from '@/lib/navigation';

export const metadata: Metadata = { title: 'Create account' };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; correct?: string }>;
}) {
  const params = await searchParams;
  const next = safeReturnPath(params.next);
  return (
    <section className="stack-lg">
      <header>
        <h1>Create an account.</h1>
      </header>
      {params.correct === '1' && (
        <p className="notice-box">
          Create your account with the correct email. Your invitation will still be waiting.
        </p>
      )}
      <SignupForm next={next} />
      <p className="muted small">
        By continuing, you agree to the{' '}
        <Link href="/terms" style={{ color: 'var(--amber)' }}>
          terms
        </Link>{' '}
        and acknowledge the{' '}
        <Link href="/privacy" style={{ color: 'var(--amber)' }}>
          privacy notice
        </Link>
        .
      </p>
    </section>
  );
}
