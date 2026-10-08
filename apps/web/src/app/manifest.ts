import type { MetadataRoute } from 'next';
import { lightTheme } from '@dwd/core';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'dwd',
    short_name: 'dwd',
    description: 'Track your drinks and look out for your friends.',
    start_url: '/home',
    scope: '/',
    display: 'standalone',
    background_color: lightTheme.background,
    theme_color: lightTheme.background,
    icons: [
      { src: '/icons/icon-192.png?v=plum', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png?v=plum', sizes: '512x512', type: 'image/png' },
      {
        src: '/dwd/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
