import { after, NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { guestSession } from '@/lib/link-up/session';
import { PhotoError, databaseError } from '@/lib/link-up/errors';
import { eventConfig, photoDatabase, rateLimit } from '@/lib/link-up/database';
import {
  requireOrganizer,
  approvedOrganizerEmail,
  verifiedOrganizer,
} from '@/lib/link-up/organizer';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { signedView } from '@/lib/link-up/r2';
import {
  adminSummary,
  authorizeBatch,
  batchSchema,
  cleanupObjects,
  completeUpload,
  gallery,
  reportPhoto,
  serializePhoto,
  sessionStatus,
  uploadUrl,
  visiblePhoto,
} from '@/lib/link-up/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Context = { params: Promise<{ path: string[] }> };
const uuid = z.uuid();
function id(value: string | undefined) {
  const result = uuid.safeParse(value);
  if (!result.success) throw new PhotoError('invalid_id', 'This photo link is invalid.');
  return result.data;
}
async function body<T>(request: NextRequest, schema: z.ZodType<T>): Promise<T> {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new PhotoError('invalid_request', 'Send a JSON request.', 415);
  // Read bounded JSON; no upload bodies ever pass through this route.
  const reader = request.body?.getReader();
  if (!reader) throw new PhotoError('invalid_request', 'The request is empty.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16_384) throw new PhotoError('invalid_request', 'This request is too large.', 413);
      chunks.push(value);
    }
    const result = schema.safeParse(JSON.parse(Buffer.concat(chunks).toString()));
    if (!result.success)
      throw new PhotoError('invalid_request', 'Check the photo request and try again.');
    return result.data;
  } catch (error) {
    if (error instanceof PhotoError) throw error;
    throw new PhotoError('invalid_request', 'The request could not be read.');
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin)
    throw new PhotoError('origin', 'Open the album on this website and try again.', 403);
}
function backgroundCleanup() {
  after(async () => {
    try {
      await cleanupObjects(15);
    } catch {
      console.error('[link-up] scheduled cleanup will retry');
    }
  });
}
function cronAuthorized(request: NextRequest) {
  const secret = process.env['CRON_SECRET'];
  if (!secret || secret.length < 32) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get('authorization') ?? '');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
async function handle(request: NextRequest, context: Context) {
  const { path } = await context.params;
  const route = path.join('/');
  const method = request.method;
  if (method !== 'GET') sameOrigin(request);

  if (method === 'GET' && route === 'cleanup') {
    if (!cronAuthorized(request)) throw new PhotoError('forbidden', 'Not authorized.', 401);
    return cleanupObjects(150);
  }
  if (method === 'GET' && route === 'gallery')
    return gallery(request.nextUrl.searchParams.get('cursor'));
  if (
    method === 'GET' &&
    path[0] === 'photos' &&
    path.length === 3 &&
    ['view', 'download'].includes(path[2] ?? '')
  ) {
    const photo = await visiblePhoto(id(path[1]));
    if (path[2] === 'view') return serializePhoto(photo);
    return { url: await signedView(photo.final_key, `the-link-up-${photo.id}.jpg`) };
  }
  if (method === 'POST' && route === 'session') {
    const session = await guestSession(true);
    backgroundCleanup();
    return sessionStatus(session, request.nextUrl.hostname);
  }
  if (method === 'POST' && route === 'batches') {
    const session = await guestSession();
    await rateLimit(session, 'authorize', 12);
    const input = await body(request, batchSchema);
    const result = await authorizeBatch(session, input, request.nextUrl.hostname);
    backgroundCleanup();
    return result;
  }
  if (method === 'POST' && route === 'batches/cancel') {
    const session = await guestSession();
    await rateLimit(session, 'cancel', 30);
    const input = await body(request, z.object({ ids: z.array(z.uuid()).max(10) }).strict());
    const result = await photoDatabase().rpc('link_up_cancel', {
      p_session: session,
      p_ids: input.ids,
    });
    if (result.error) databaseError(result.error);
    backgroundCleanup();
    return { cancelled: result.data };
  }
  if (method === 'POST' && path[0] === 'uploads' && path.length === 3) {
    const session = await guestSession();
    const uploadId = id(path[1]);
    if (path[2] === 'url') {
      await rateLimit(session, 'renew', 120);
      return uploadUrl(session, uploadId);
    }
    if (path[2] === 'complete') {
      await rateLimit(session, 'complete', 180);
      const result = await completeUpload(session, uploadId);
      backgroundCleanup();
      return result;
    }
  }
  if (method === 'POST' && path[0] === 'photos' && path[2] === 'report' && path.length === 3) {
    const session = await guestSession(true);
    await rateLimit(session, 'report', 5);
    const input = await body(
      request,
      z.object({ reason: z.enum(['inappropriate', 'privacy', 'other']) }).strict(),
    );
    return reportPhoto(session, id(path[1]), input.reason);
  }

  if (method === 'POST' && route === 'organizer-sign-in') {
    const session = await guestSession(true);
    await rateLimit(session, 'sign-in', 3);
    const input = await body(request, z.object({ email: z.email().max(254) }).strict());
    if (!approvedOrganizerEmail(input.email))
      throw new PhotoError('forbidden', 'Use an approved organizer email.', 403);
    const client = await createServerSupabaseClient();
    const { error } = await client.auth.signInWithOtp({
      email: input.email.trim().toLowerCase(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${request.nextUrl.origin}/events/the-link-up/admin/confirm?source=link-up`,
      },
    });
    if (error)
      throw new PhotoError(
        'sign_in_failed',
        'Could not send the sign-in email. If you are new to DWD, create and verify your account first. Otherwise wait a minute and retry.',
        503,
      );
    return { sent: true };
  }
  if (method === 'POST' && route === 'organizer-confirm') {
    const session = await guestSession(true);
    await rateLimit(session, 'confirm', 10);
    const input = await body(
      request,
      z.union([
        z
          .object({
            code: z.string().min(1).max(2048),
            flowId: z.string().min(1).max(128).optional(),
          })
          .strict(),
        z.object({ token_hash: z.string().min(1).max(2048) }).strict(),
        z
          .object({
            access_token: z.string().min(1).max(8192),
            refresh_token: z.string().min(1).max(2048),
          })
          .strict(),
      ]),
    );
    const client = await createServerSupabaseClient();
    const result =
      'code' in input
        ? await client.auth.exchangeCodeForSession(
            input.code,
            input.flowId ? { flowId: input.flowId } : undefined,
          )
        : 'token_hash' in input
          ? await client.auth.verifyOtp({ token_hash: input.token_hash, type: 'email' })
          : await client.auth.setSession(input);
    if (result.error || !verifiedOrganizer(result.data.user))
      throw new PhotoError(
        'sign_in_failed',
        'This sign-in link expired or is not an organizer link. Request a new one.',
        403,
      );
    await requireOrganizer();
    return { verified: true };
  }
  if (path[0] === 'admin') {
    await requireOrganizer(); // Every admin route, including reads, passes this check.
    if (method === 'GET' && route === 'admin/summary') return adminSummary();
    if (method === 'GET' && route === 'admin/gallery')
      return gallery(request.nextUrl.searchParams.get('cursor'), true);
    if (
      method === 'GET' &&
      path[1] === 'photos' &&
      path.length === 4 &&
      ['view', 'download'].includes(path[3] ?? '')
    ) {
      const photo = await visiblePhoto(id(path[2]), true);
      if (path[3] === 'view') return serializePhoto(photo);
      return { url: await signedView(photo.final_key, `the-link-up-${photo.id}.jpg`) };
    }
    if (method === 'PATCH' && route === 'admin/settings') {
      const input = await body(
        request,
        z
          .object({
            uploads_enabled: z.boolean().optional(),
            gallery_enabled: z.boolean().optional(),
          })
          .strict(),
      );
      const event = await eventConfig();
      const result = await photoDatabase()
        .from('photo_events')
        .update({
          ...(input.uploads_enabled === undefined
            ? {}
            : { uploads_enabled: input.uploads_enabled }),
          ...(input.gallery_enabled === undefined
            ? {}
            : { gallery_enabled: input.gallery_enabled }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', event.id);
      if (result.error) databaseError(result.error);
      return { updated: true };
    }
    if (method === 'POST' && path[1] === 'photos' && path.length === 4) {
      const action = z.enum(['hide', 'show', 'delete']).safeParse(path[3]);
      if (!action.success) throw new PhotoError('invalid_action', 'Choose a photo action.');
      const result = await photoDatabase().rpc('link_up_moderate', {
        p_id: id(path[2]),
        p_action: action.data,
      });
      if (result.error) databaseError(result.error);
      if (action.data === 'delete') await cleanupObjects(30);
      return { updated: true };
    }
    if (method === 'POST' && path[1] === 'reports' && path[3] === 'review' && path.length === 4) {
      const result = await photoDatabase()
        .from('photo_reports')
        .update({ status: 'reviewed', reviewed_at: new Date().toISOString() })
        .eq('id', id(path[2]));
      if (result.error) databaseError(result.error);
      return { reviewed: true };
    }
    if (method === 'POST' && route === 'admin/cleanup') return cleanupObjects(150);
  }
  throw new PhotoError('not_found', 'This album action was not found.', 404);
}
async function respond(request: NextRequest, context: Context) {
  try {
    return NextResponse.json(await handle(request, context), {
      headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
    });
  } catch (error) {
    const known = error instanceof PhotoError;
    if (!known) console.error('[link-up] request failed');
    return NextResponse.json(
      {
        error: known ? error.message : 'The album could not connect. Please retry.',
        code: known ? error.code : 'unavailable',
      },
      {
        status: known ? error.status : 503,
        headers: {
          'Cache-Control': 'private, no-store',
          ...(known && error.status === 429 ? { 'Retry-After': '600' } : {}),
        },
      },
    );
  }
}
export const GET = respond;
export const POST = respond;
export const PATCH = respond;
