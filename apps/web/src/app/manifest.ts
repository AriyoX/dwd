import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'DWD — Drink with Desire',
    short_name: 'DWD',
    description: 'Track your drinks and look out for your friends.',
    start_url: '/home',
    scope: '/',
    display: 'standalone',
    background_color: '#f8f4ef',
    theme_color: '#2d0b20',
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
