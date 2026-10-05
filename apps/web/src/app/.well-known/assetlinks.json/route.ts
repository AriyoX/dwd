import { androidAppAssociation } from '@/lib/mobile-links';
export function GET() {
  const fingerprints: unknown = process.env['DWD_ANDROID_SHA256_FINGERPRINTS'];
  const association = androidAppAssociation(
    typeof fingerprints === 'string' ? fingerprints : undefined,
  );
  return association
    ? Response.json(association, { headers: { 'Cache-Control': 'public, max-age=3600' } })
    : new Response('App association is not configured.', { status: 404 });
}
