import 'server-only';
import { Readable } from 'node:stream';
import { ZipFile } from 'yazl';
import type { PhotoRow } from '@/features/events/photo-contracts';
import { eventConfig, photoDatabase } from './database';
import { databaseError, PhotoError } from './errors';
import { readPhotoObject } from './r2';

type ArchivePhoto = Pick<PhotoRow, 'id' | 'final_key' | 'size_bytes' | 'status' | 'published_at'>;

export async function archivePhotos() {
  const event = await eventConfig();
  const photos: ArchivePhoto[] = [];
  const startedAt = new Date().toISOString();
  let cursor: string | undefined;
  for (;;) {
    let query = photoDatabase()
      .from('event_photos')
      .select('id,final_key,size_bytes,status,published_at')
      .eq('event_id', event.id)
      .in('status', ['published', 'hidden'])
      .lte('published_at', startedAt)
      .order('id', { ascending: true })
      .limit(500);
    if (cursor) query = query.gt('id', cursor);
    const { data, error } = await query;
    if (error) databaseError(error);
    photos.push(...data);
    const last = data.at(-1);
    if (data.length < 500 || !last) break;
    cursor = last.id;
  }
  if (!photos.length) throw new PhotoError('no_photos', 'There are no photos to export yet.', 409);
  return photos;
}

export async function photoArchive(photos: ArchivePhoto[], requestSignal: AbortSignal) {
  const zip = new ZipFile();
  const output = zip.outputStream as Readable;
  const controller = new AbortController();
  const signal = AbortSignal.any([requestSignal, controller.signal]);
  let active: Readable | undefined;
  const fail = (error: unknown) => {
    output.destroy(error instanceof Error ? error : new Error('Photo export failed.'));
  };
  const abort = () => output.destroy(new Error('Photo export cancelled.'));
  signal.addEventListener('abort', abort, { once: true });
  output.once('close', () => {
    signal.removeEventListener('abort', abort);
    controller.abort();
    active?.destroy();
  });
  zip.on('error', fail);
  // Attach the consumer before a lazy storage read can fail.
  const response = new Response(Readable.toWeb(output) as ReadableStream<Uint8Array>, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="the-link-up-photos.zip"',
      'Cache-Control': 'private, no-store',
      Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff',
    },
  });
  for (const photo of photos) {
    const folder = photo.status === 'hidden' ? 'hidden' : 'photos';
    zip.addReadStreamLazy(
      `${folder}/the-link-up-${photo.id}.jpg`,
      { compress: false, size: photo.size_bytes, mtime: new Date(photo.published_at) },
      (callback) => {
        if (signal.aborted) {
          fail(new Error('Photo export cancelled.'));
          return;
        }
        void readPhotoObject(photo.final_key, signal).then((stream) => {
          if (signal.aborted) {
            stream.destroy();
            fail(new Error('Photo export cancelled.'));
            return;
          }
          active = stream;
          callback(null, stream);
        }, fail);
      },
    );
  }
  // Known sizes and uncompressed JPEG entries let browsers detect partial downloads.
  const size = await new Promise<number>((resolve) => {
    // Package types omit the documented callback argument and optional end fields.
    const end = zip.end.bind(zip) as unknown as (
      options: Record<string, never>,
      callback: (size: number) => void,
    ) => void;
    end({}, resolve);
  });
  response.headers.set('Content-Length', String(size));
  return response;
}
