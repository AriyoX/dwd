import { ConfirmationForm } from '@/features/auth/confirmation-form';
import { safeReturnPath } from '@/lib/navigation';

export const metadata = { title: 'Confirm your email' };
export default async function ConfirmationHelp({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const destination = safeReturnPath(params.next);
  // Password recovery wraps the original invitation in a reset-password destination.
  const next = destination.startsWith('/reset-password?')
    ? safeReturnPath(new URL(destination, 'https://dwd.invalid').searchParams.get('next'))
    : destination;
  return (
    <section className="stack-lg">
      <h1>Confirm your email.</h1>
      {params.error && (
        <p className="warning-box" role="alert">
          This link could not be verified. It may have expired, been used, or opened in a different
          browser. Try the newest link in the browser where you signed up, or request a new one
          below.
        </p>
      )}
      <ConfirmationForm next={next} />
    </section>
  );
}
