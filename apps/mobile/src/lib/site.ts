export function siteUrl() {
  const configured = process.env.EXPO_PUBLIC_SITE_URL ?? 'https://dwdug.vercel.app';
  const url = new URL(configured);
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1'))
  )
    throw new Error('DWD website unavailable.');
  return url.origin;
}
