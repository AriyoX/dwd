import { publicMetadata } from '@/lib/public-metadata';
import { LegalPage } from '@/components/legal-page';
export const metadata = publicMetadata(
  'Drinking & safety',
  'Understand what a drink count can and cannot tell you. DWD is for adults of legal drinking age.',
  '/safety',
);
export default function SafetyPage() {
  return (
    <LegalPage
      document={{
        title: 'Drinking & safety',
        introduction: 'For adults 18+ who meet their local legal drinking age.',
        sections: [
          {
            title: 'Your own pace',
            paragraphs: [
              'Counts show what you logged, never a target. Take breaks, look after your mates and arrange a safe way home.',
            ],
          },
          {
            title: 'Counts are not measurements',
            paragraphs: [
              'Quick Log does not record drink sizes or alcohol strength. DWD cannot determine sobriety or driving safety. Do not use a drink count to decide whether you can drive.',
            ],
          },
          {
            title: 'Get help',
            paragraphs: [
              'If someone needs urgent help, contact local emergency services. Do not wait for an app to assess their condition.',
            ],
          },
        ],
      }}
    />
  );
}
