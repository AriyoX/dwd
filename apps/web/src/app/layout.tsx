import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { ThemeToggle } from '@/components/layout/theme-toggle';

export const metadata: Metadata = {
  title: { default: 'DWD', template: '%s · DWD' },
  description: 'Track what you drink during a shared night out.',
  applicationName: 'DWD',
  verification: {
    google:
      process.env['GOOGLE_SITE_VERIFICATION']?.trim() ||
      'N-WnXdt4YgDtDyI4mWTH3fuLIINC2L1WEBP_IjaP_38',
  },
  appleWebApp: { capable: true, title: 'DWD', statusBarStyle: 'default' },
  icons: { apple: '/icons/apple-touch-icon.png' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: '#f7f7f0',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('dwd-theme');document.documentElement.dataset.theme=t==='dark'||t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}})();`,
          }}
        />
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
