# dwd brand assets

The app palette is defined in `src/app/globals.css`. Light mode uses plum
`#4A102F` on warm white `#F8F4EF`; dark mode uses `#160B12` with rose actions.
Drink accents use burgundy, and water controls use muted blue-lavender.

`brand-mark.svg` is the supplied `dwd_black.svg` with its outer whitespace
removed through the SVG viewBox. The shared Wordmark component uses it as a
CSS mask, giving the mark the exact plum or warm-white theme color.
Original supplied files are preserved.

Installation assets are declared in `src/app/manifest.ts`:

- `/icons/icon-192.png` and `/icons/icon-512.png` use the supplied Android artwork.
- `icon-maskable-512.png` uses the vector mark on a full-bleed plum gradient,
  with the mark inside the central maskable safe area.
- `/icons/apple-touch-icon.png` is the 180px version of that full-bleed artwork.
- `src/app/icon.svg` provides the matching vector browser favicon.
- `src/app/favicon.ico` contains 16px, 32px, and 48px versions for browser compatibility.
- `/icons/favicon-16.png` and `/icons/favicon-32.png` provide explicit small PNG
  favicons, declared with versioned URLs in the root layout.

When changing installation icons, update the manifest and Apple icon URLs to
invalidate cached assets. Installed applications may keep their previous icon
until the browser refreshes installation metadata or the user reinstalls.
