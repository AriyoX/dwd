import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type {
  AdminSummary,
  GalleryPage,
  GalleryPhoto,
  PhotoRow,
  SessionStatus,
  UploadTicket,
} from '@/features/events/photo-contracts';
import { MAX_PHOTO_BYTES } from '@/features/events/photo-contracts';
import { databaseError, PhotoError } from './errors';
import { eventConfig, photoDatabase } from './database';
import { protectionStatus, verifyTurnstile } from './turnstile';
import { readStaged, removeObject, r2Config, signedUpload, signedView, storeImage } from './r2';
import { normalizePhoto } from './images';

export const batchSchema = z
  .object({
    batchId: z.uuid(),
    token: z.string().max(2048).optional(),
    files: z
      .array(
        z
          .object({
            clientId: z.uuid(),
            fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
            type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
            size: z.number().int().min(1).max(MAX_PHOTO_BYTES),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict();

export async function sessionStatus(session: string, hostname: string): Promise<SessionStatus> {
  const db = photoDatabase();
  const expired = await db.rpc('link_up_expire_uploads', {});
  if (expired.error) databaseError(expired.error);
  const event = await eventConfig();
  const { error } = await db
    .from('photo_guest_sessions')
    .upsert({ id: session, event_id: event.id }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) databaseError(error);
  const [guest, pending, recent] = await Promise.all([
    db.from('photo_guest_sessions').select('published_count').eq('id', session).single(),
    db
      .from('photo_upload_reservations')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', session)
      .in('status', ['pending', 'verifying']),
    db
      .from('photo_upload_reservations')
      .select('id,client_id,status')
      .eq('session_id', session)
      .order('created_at', { ascending: false })
      .limit(25),
  ]);
  if (guest.error) databaseError(guest.error);
  if (pending.error) databaseError(pending.error);
  if (recent.error) databaseError(recent.error);
  return {
    uploadsEnabled: event.uploads_enabled,
    galleryEnabled: event.gallery_enabled,
    remaining: Math.max(
      0,
      event.session_photo_limit - guest.data.published_count - (pending.count ?? 0),
    ),
    batchLimit: event.batch_limit,
    protection: protectionStatus(hostname),
    recentUploads: recent.data.map((r) => ({ id: r.id, clientId: r.client_id, status: r.status })),
  };
}

export async function authorizeBatch(
  session: string,
  input: z.infer<typeof batchSchema>,
  hostname: string,
): Promise<{ tickets: UploadTicket[] }> {
  r2Config();
  // An identical already-authorized batch can be recovered after a lost response,
  // without consuming a single-use Turnstile token a second time.
  const prior = await photoDatabase()
    .from('photo_upload_reservations')
    .select('id')
    .eq('session_id', session)
    .eq('batch_id', input.batchId)
    .limit(1);
  if (prior.error) databaseError(prior.error);
  if (!prior.data.length) await verifyTurnstile(input.token, hostname);
  const { data, error } = await photoDatabase().rpc('link_up_reserve', {
    p_session: session,
    p_batch: input.batchId,
    p_files: input.files,
  });
  if (error) databaseError(error);
  return { tickets: data.map((r) => ({ id: r.id, clientId: r.client_id, status: r.status })) };
}

export async function uploadUrl(session: string, id: string) {
  const { data, error } = await photoDatabase().rpc('link_up_upload_url', {
    p_session: session,
    p_id: id,
  });
  if (error) databaseError(error);
  return {
    url: await signedUpload(data),
    contentType: data.content_type,
    expiresAt: Date.now() + 300_000,
  };
}

export async function completeUpload(session: string, id: string) {
  const db = photoDatabase();
  const lease = randomUUID();
  const claim = await db.rpc('link_up_claim', { p_session: session, p_id: id, p_lease: lease });
  if (claim.error) databaseError(claim.error);
  const reservation = claim.data;
  if (reservation.status === 'completed') return { photoId: id, status: 'completed' };
  try {
    const staged = await readStaged(reservation);
    const normalized = await normalizePhoto(staged, reservation.content_type);
    await storeImage(reservation.final_key, normalized.image);
    await storeImage(reservation.thumbnail_key, normalized.thumbnail);
    const finish = await db.rpc('link_up_finish', {
      p_id: id,
      p_lease: lease,
      p_size: normalized.image.length,
      p_thumb_size: normalized.thumbnail.length,
      p_width: normalized.width,
      p_height: normalized.height,
    });
    if (finish.error) databaseError(finish.error);
    // The outbox deletes it again after PUT expiry, in case the guest replays it.
    await removeObject(reservation.temporary_key).catch(() => undefined);
    return { photoId: id, status: 'completed' };
  } catch (error) {
    const permanent = error instanceof PhotoError && error.code === 'invalid_image';
    await db.rpc('link_up_fail', {
      p_id: id,
      p_lease: lease,
      p_code: permanent ? 'invalid_image' : 'verification_interrupted',
      p_permanent: permanent,
    });
    if (error instanceof PhotoError) throw error;
    throw new PhotoError(
      'verification_interrupted',
      'Verification was interrupted. Your uploaded photo can be retried.',
      503,
    );
  }
}

export async function cleanupObjects(limit = 30) {
  const db = photoDatabase();
  const expired = await db.rpc('link_up_expire_uploads', {});
  if (expired.error) databaseError(expired.error);
  const due = await db
    .from('photo_object_cleanup')
    .select('object_key,not_before')
    .lte('not_before', new Date().toISOString())
    .order('not_before')
    .limit(limit);
  if (due.error) databaseError(due.error);
  let removed = 0;
  const queue = [...due.data];
  const deadline = Date.now() + 15_000;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      // Drain large or slow backlogs over repeated calls within the route's time limit.
      for (let item = queue.shift(); item && Date.now() < deadline; item = queue.shift()) {
        try {
          await removeObject(item.object_key);
          const ack = await db
            .from('photo_object_cleanup')
            .delete()
            .eq('object_key', item.object_key)
            // A concurrent retry may have extended the replay-protection window.
            // Acknowledge only the version of the work that we actually processed.
            .eq('not_before', item.not_before)
            .select('object_key');
          if (!ack.error && ack.data.length) removed++;
        } catch {
          console.error('[link-up] object cleanup will retry');
        }
      }
    }),
  );
  const final = await db.rpc('link_up_finalize_deletions', {});
  if (final.error) databaseError(final.error);
  return { expired: expired.data, removed, deleted: final.data };
}

export async function serializePhoto(photo: PhotoRow): Promise<GalleryPhoto> {
  const [thumbnailUrl, imageUrl] = await Promise.all([
    signedView(photo.thumbnail_key),
    signedView(photo.final_key),
  ]);
  return {
    id: photo.id,
    width: photo.width,
    height: photo.height,
    publishedAt: photo.published_at,
    thumbnailUrl,
    imageUrl,
    expiresAt: Date.now() + 115_000,
    status: photo.status,
  };
}
const cursorSchema = z.object({ at: z.iso.datetime({ offset: true }), id: z.uuid() }).strict();
export function decodeCursor(value: string | null) {
  if (!value) return null;
  if (value.length > 300)
    throw new PhotoError('invalid_cursor', 'Refresh the gallery to continue.');
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString()));
  } catch {
    throw new PhotoError('invalid_cursor', 'Refresh the gallery to continue.');
  }
}
export async function gallery(
  cursor: string | null,
  admin = false,
  status?: 'published' | 'hidden',
): Promise<GalleryPage> {
  const event = await eventConfig();
  if (!admin && !event.gallery_enabled)
    return { photos: [], nextCursor: null, galleryEnabled: false };
  let query = photoDatabase()
    .from('event_photos')
    .select('*')
    .eq('event_id', event.id)
    .order('published_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(25);
  query = admin
    ? status
      ? query.eq('status', status)
      : query.in('status', ['published', 'hidden'])
    : query.eq('status', 'published');
  const position = decodeCursor(cursor);
  if (position)
    query = query.or(
      `published_at.lt.${position.at},and(published_at.eq.${position.at},id.lt.${position.id})`,
    );
  const { data, error } = await query;
  if (error) databaseError(error);
  const rows = data;
  const page = rows.slice(0, 24);
  const last = page.at(-1);
  return {
    photos: await Promise.all(page.map(serializePhoto)),
    nextCursor:
      rows.length > 24 && last
        ? Buffer.from(JSON.stringify({ at: last.published_at, id: last.id })).toString('base64url')
        : null,
    galleryEnabled: event.gallery_enabled,
  };
}
export async function visiblePhoto(id: string, admin = false) {
  const event = await eventConfig();
  if (!admin && !event.gallery_enabled)
    throw new PhotoError('gallery_paused', 'The gallery is currently closed.', 404);
  const { data, error } = await photoDatabase()
    .from('event_photos')
    .select('*')
    .eq('id', id)
    .eq('event_id', event.id)
    .maybeSingle();
  if (error) databaseError(error);
  if (
    !data ||
    (admin ? ['deleting', 'deleted'].includes(data.status) : data.status !== 'published')
  ) {
    throw new PhotoError('photo_not_found', 'This photo is no longer available.', 404);
  }
  return data;
}
export async function reportPhoto(
  session: string,
  id: string,
  reason: 'inappropriate' | 'privacy' | 'other',
) {
  await visiblePhoto(id);
  const { error } = await photoDatabase()
    .from('photo_reports')
    .upsert(
      { photo_id: id, session_id: session, reason },
      { onConflict: 'photo_id,session_id', ignoreDuplicates: true },
    );
  if (error) databaseError(error);
  return { reported: true };
}
export async function adminSummary(): Promise<AdminSummary> {
  const db = photoDatabase();
  // Release stale holds before reading counters, rather than reporting them until cleanup runs.
  const expired = await db.rpc('link_up_expire_uploads', {});
  if (expired.error) databaseError(expired.error);
  const event = await eventConfig();
  const statuses = ['published', 'hidden', 'deleting', 'deleted'] as const;
  const counts = await Promise.all(
    statuses.map((status) =>
      db
        .from('event_photos')
        .select('id', { head: true, count: 'exact' })
        .eq('event_id', event.id)
        .eq('status', status),
    ),
  );
  for (const result of counts) if (result.error) databaseError(result.error);
  const [reports, errors, guests, pending] = await Promise.all([
    db
      .from('photo_reports')
      .select('id,photo_id,reason,status,created_at', { count: 'exact' })
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(100),
    db
      .from('photo_upload_reservations')
      .select('id,error_code,status,created_at')
      .eq('event_id', event.id)
      .not('error_code', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20),
    db
      .from('photo_guest_sessions')
      .select('id', { head: true, count: 'exact' })
      .eq('event_id', event.id)
      .gt('published_count', 0),
    db
      .from('photo_upload_reservations')
      .select('id', { head: true, count: 'exact' })
      .eq('event_id', event.id)
      .in('status', ['pending', 'verifying']),
  ]);
  for (const result of [reports, errors, guests, pending])
    if (result.error) databaseError(result.error);
  return {
    event: {
      uploads_enabled: event.uploads_enabled,
      gallery_enabled: event.gallery_enabled,
      used_bytes: event.used_bytes,
      reserved_bytes: event.reserved_bytes,
      storage_budget_bytes: event.storage_budget_bytes,
      upload_error_count: event.upload_error_count,
      session_photo_limit: event.session_photo_limit,
      batch_limit: event.batch_limit,
    },
    counts: {
      ...Object.fromEntries(statuses.map((status, i) => [status, counts[i]?.count ?? 0])),
      guests: guests.count ?? 0,
      pending: pending.count ?? 0,
      reports: reports.count ?? 0,
    },
    reports: reports.data ?? [],
    errors: errors.data ?? [],
  };
}
