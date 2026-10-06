import type { Metadata } from 'next';
import { TERMS_OF_SERVICE } from '@dwd/core';
import { LegalPage } from '@/components/legal-page';
export const metadata: Metadata = { title: 'Terms of service' };
export default function TermsPage() {
  return <LegalPage document={TERMS_OF_SERVICE} />;
}
