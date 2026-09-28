'use server';

import { z } from 'zod';
import { deleteNightPhoto, getNightPhotos, registerNightPhoto } from '@dwd/data';
import type { NightPhoto } from '@dwd/core';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const nightIdSchema = z.uuid();
const photoSchema = z.object({
  id: z.uuid(),
  nightId: z.uuid(),
  objectPath: z.string().min(10).max(500),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  byteSize: z
    .number()
    .int()
    .min(1)
    .max(10 * 1024 * 1024),
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
): Promise<{ ok: true; photo: NightPhoto } | { ok: false; error: string }> {
  const parsed = photoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That photo is invalid.' };
  try {
    return {
      ok: true,
      photo: await registerNightPhoto(await authenticatedClient(), parsed.data),
    };
  } catch {
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
