import { NextResponse, type NextRequest } from 'next/server';
import { requireOrganizer } from '@/lib/link-up/organizer';
import { PageAccessError } from '@/lib/auth/page-access';
import { PhotoError } from '@/lib/link-up/errors';
import { archivePhotos, photoArchive } from '@/lib/link-up/archive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    await requireOrganizer();
    const photos = await archivePhotos();
    if (request.nextUrl.searchParams.get('download') === '1')
      return await photoArchive(photos, request.signal);
    return NextResponse.json(
      { url: '/api/events/admin/the-link-up/export?download=1' },
      { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } },
    );
  } catch (error) {
    const known = error instanceof PhotoError || error instanceof PageAccessError;
    return NextResponse.json(
      {
        error: known ? error.message : 'Photos could not be exported. Please try again.',
        code: known ? error.code : 'unavailable',
      },
      {
        status: known ? error.status : 503,
        headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
      },
    );
  }
}
