import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, NightPhoto } from '@dwd/core';
import { unwrapRpc } from '../shared/rpc';

export async function getNightPhotos(
  client: SupabaseClient<Database>,
  nightId: string,
): Promise<NightPhoto[]> {
  const { data, error } = await client.rpc('get_night_photos', { p_night_id: nightId });
  return unwrapRpc<NightPhoto[]>(data, error);
}

export async function registerNightPhoto(
  client: SupabaseClient<Database>,
  photo: {
    id: string;
    nightId: string;
    objectPath: string;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    byteSize: number;
    width: number;
    height: number;
  },
): Promise<NightPhoto> {
  const { data, error } = await client.rpc('register_night_photo', {
    p_photo_id: photo.id,
    p_night_id: photo.nightId,
    p_object_path: photo.objectPath,
    p_mime_type: photo.mimeType,
    p_byte_size: photo.byteSize,
    p_width: photo.width,
    p_height: photo.height,
  });
  return unwrapRpc<NightPhoto>(data, error);
}

export async function deleteNightPhoto(
  client: SupabaseClient<Database>,
  photoId: string,
): Promise<{ deleted: boolean; objectPath: string }> {
  const { data, error } = await client.rpc('delete_night_photo', { p_photo_id: photoId });
  return unwrapRpc<{ deleted: boolean; objectPath: string }>(data, error);
}
