import { appleAppAssociation } from '@/lib/mobile-links';
export function GET() {
  const team: unknown = process.env['DWD_APPLE_TEAM_ID'];
  const association = appleAppAssociation(typeof team === 'string' ? team : undefined);
  return association
    ? Response.json(association, { headers: { 'Cache-Control': 'public, max-age=3600' } })
    : new Response('App association is not configured.', { status: 404 });
}
