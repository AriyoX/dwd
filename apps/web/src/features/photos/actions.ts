'use server';

import { z } from 'zod';
import { deleteNightPhoto, getNightPhotos, registerNightPhoto } from '@dwd/data';
import { MAX_MEMORY_PHOTO_BYTES, type NightPhoto } from '@dwd/core';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const nightIdSchema = z.uuid();
const photoSchema = z.object({
  id: z.uuid(),
  nightId: z.uuid(),
  objectPath: z.string().min(10).max(500),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  byteSize: z.number().int().min(1).max(MAX_MEMORY_PHOTO_BYTES),
  width: z.number().int().min(1).max(10_000),
  height: z.number().int().min(1).max(10_000),
});

async function authenticatedClient() {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.auth.getClaims();
  if (error !== null || data?.claims.sub === undefined) throw new Error('Authentication required.');
  return client;
}

export async function getNightPhotosAction(
  input: unknown,
): Promise<
  { ok: true; photos: Array<NightPhoto & { url: string }> } | { ok: false; error: string }
> {
  const parsed = nightIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That night is invalid.' };
  try {
    const client = await authenticatedClient();
    const photos = await getNightPhotos(client, parsed.data);
    if (photos.length === 0) return { ok: true, photos: [] };
    const { data, error } = await client.storage.from('night-memories').createSignedUrls(
      photos.map((photo) => photo.objectPath),
      15 * 60,
    );
    if (error) throw error;
    const urls = new Map(data.map((item) => [item.path, item.signedUrl]));
    return {
      ok: true,
      photos: photos.flatMap((photo) => {
        const url = urls.get(photo.objectPath);
        return url ? [{ ...photo, url }] : [];
      }),
    };
  } catch {
    return { ok: false, error: 'Memories could not load. Retry when connected.' };
  }
}

export async function registerNightPhotoAction(
  input: unknown,
): Promise<{ ok: true; photo: NightPhoto } | { ok: false; error: string; permanent?: boolean }> {
  const parsed = photoSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: 'Photos must be valid images of 5 MB or smaller.', permanent: true };
  try {
    return {
      ok: true,
      photo: await registerNightPhoto(await authenticatedClient(), parsed.data),
    };
  } catch (cause) {
    const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : null;
    if (code === '54000')
      return { ok: false, error: 'You can save up to 2 photos per night.', permanent: true };
    if (code === '22023')
      return {
        ok: false,
        error: 'The photo could not be saved. Use an image of 5 MB or smaller.',
        permanent: true,
      };
    return { ok: false, error: 'The upload finished, but the photo could not be saved. Retry.' };
  }
}

export async function deleteNightPhotoAction(
  input: unknown,
): Promise<{ ok: true; objectPath: string } | { ok: false; error: string }> {
  const parsed = z.uuid().safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That photo is invalid.' };
  try {
    const client = await authenticatedClient();
    const { data: claims } = await client.auth.getClaims();
    if (!claims?.claims.sub) throw new Error('Authentication required.');
    const { data: photo, error: lookupError } = await client
      .from('night_photos')
      .select('object_path')
      .eq('id', parsed.data)
      .eq('uploaded_by_user_id', claims.claims.sub)
      .maybeSingle();
    if (lookupError) throw lookupError;
    // Storage DELETE also needs SELECT. Keep the participant-visible metadata
    // until removal succeeds; the RPC remains idempotent if a retry is needed.
    if (photo) {
      const { error: removalError } = await client.storage
        .from('night-memories')
        .remove([photo.object_path]);
      if (removalError) throw removalError;
    }
    const result = await deleteNightPhoto(client, parsed.data);
    return { ok: true, objectPath: result.objectPath };
  } catch {
    return {
      ok: false,
      error: 'Photo could not be deleted. Only its uploader can delete it; retry when connected.',
    };
  }
}
