import type { Metadata } from 'next';
import { PRIVACY_POLICY } from '@dwd/core';
import { LegalPage } from '@/components/legal-page';
export const metadata: Metadata = { title: 'Privacy policy' };
export default function PrivacyPage() {
  return <LegalPage document={PRIVACY_POLICY} />;
}
