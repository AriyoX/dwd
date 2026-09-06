export function resolveSiteUrl(environment: Record<string, string | undefined>): string {
  const previewUrl =
    environment['VERCEL_ENV'] === 'preview' ? environment['VERCEL_URL'] : undefined;
  const configuredUrl =
    previewUrl ??
    environment['NEXT_PUBLIC_SITE_URL'] ??
    environment['VERCEL_PROJECT_PRODUCTION_URL'] ??
    environment['VERCEL_URL'];
  if (!configuredUrl) {
    if (environment['VERCEL'] === '1') throw new Error('The deployment site URL is missing.');
    return 'http://localhost:3000';
  }
  const url = new URL(configuredUrl.includes('://') ? configuredUrl : `https://${configuredUrl}`);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (
    url.username ||
    url.password ||
    (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
    (environment['VERCEL'] === '1' && local)
  ) {
    throw new Error('Use an HTTPS application URL for this deployment.');
  }
  return url.origin;
}
