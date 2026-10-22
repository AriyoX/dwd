import { publicMetadata } from '@/lib/public-metadata';
import { PRIVACY_POLICY } from '@dwd/core';
import { LegalPage } from '@/components/legal-page';
export const metadata = publicMetadata(
  'Privacy policy',
  'How DWD handles your account, drink logs and shared photos.',
  '/privacy',
);
export default function PrivacyPage() {
  return <LegalPage document={PRIVACY_POLICY} />;
}
