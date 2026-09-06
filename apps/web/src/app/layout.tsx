import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Drink with Desire', template: '%s · Drink with Desire' },
  description: 'Track what you drink during a shared night out.',
  applicationName: 'Drink with Desire',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f7f7f0',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
