import { rememberTourAction } from '@/features/tour/actions';

export async function POST(request: Request) {
  // This cookie-authenticated display preference can only be changed from this app.
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return new Response(null, { status: 403 });
  const saved = await rememberTourAction();
  return new Response(null, {
    status: saved ? 204 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
