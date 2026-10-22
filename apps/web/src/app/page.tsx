import { redirect } from 'next/navigation';
import { publicMetadata } from '@/lib/public-metadata';
import { resolveSiteUrl } from '@/lib/site-url';
import { getAuthenticatedUserId } from '@/lib/supabase/server';
import { LandingPage } from '@/features/landing/landing-page';
import { quickEntryDestination } from '@/features/quick-log/entry-routing';

export const dynamic = 'force-dynamic';
export const metadata = publicMetadata(
  'Your night. Your own pace.',
  'Keep count of drinks and chasers, plan a night with mates, and revisit shared memories with DWD. Try Quick Log without an account.',
  '/',
);

export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<{ join?: string }>;
}) {
  const params = await searchParams;
  const invitation = quickEntryDestination(null, params.join);
  if (invitation) redirect(invitation);
  const userId = await getAuthenticatedUserId().catch(() => null);
  const destination = quickEntryDestination(userId);
  if (destination) redirect(destination);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'DWD',
            url: resolveSiteUrl(process.env),
            description:
              'A drink log for your night out. Keep count of drinks and chasers, plan shared nights and revisit memories.',
          }).replace(/</g, '\\u003c'),
        }}
      />
      <LandingPage />
    </>
  );
}
