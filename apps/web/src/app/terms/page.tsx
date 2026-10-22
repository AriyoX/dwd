import { publicMetadata } from '@/lib/public-metadata';
import { TERMS_OF_SERVICE } from '@dwd/core';
import { LegalPage } from '@/components/legal-page';
export const metadata = publicMetadata(
  'Terms of service',
  'Terms for using DWD, including accounts, shared nights and event photos.',
  '/terms',
);
export default function TermsPage() {
  return <LegalPage document={TERMS_OF_SERVICE} />;
}
