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
    background_color: '#f7f7f0',
    theme_color: '#253b2e',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
