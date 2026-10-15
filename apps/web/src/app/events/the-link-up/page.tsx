import type { Metadata, Viewport } from 'next';
import { TheLinkUp } from '@/features/events/the-link-up';

const url = 'https://dwdug.vercel.app/events/the-link-up';
const description = 'The night. The people. The memories. A shared home for The Link Up moments.';

export const metadata: Metadata = {
  title: 'The Link Up',
  description,
  alternates: { canonical: url },
  openGraph: {
    title: 'The Link Up · The night. The people. The memories.',
    description,
    url,
    type: 'website',
    images: [{ url: 'https://dwdug.vercel.app/ads/link-up-banner.jpg', width: 1200, height: 600 }],
  },
};

export const viewport: Viewport = { themeColor: '#081607', colorScheme: 'dark', viewportFit: 'cover' };

export default function TheLinkUpPage() {
  return <TheLinkUp />;
}
