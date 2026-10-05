import { z } from 'zod';
import {
  MAX_MEMORY_PHOTO_BYTES,
  MAX_PHOTOS_PER_PERSON_PER_NIGHT,
  type Database,
  type NightPhoto,
} from '@dwd/core';
import { deleteNightPhoto, getNightPhotos, registerNightPhoto } from '@dwd/data';
import type { SupabaseClient } from '@supabase/supabase-js';

export const photoTaskSchema = z.object({
  version: z.literal(1),
  owner: z.uuid(),
  nightId: z.uuid(),
  id: z.uuid(),
  width: z.number().int().positive().max(10000),
  height: z.number().int().positive().max(10000),
  byteSize: z.number().int().positive().max(MAX_MEMORY_PHOTO_BYTES),
});
export type PhotoTask = z.infer<typeof photoTaskSchema>;
export const photoTaskKey = (owner: string, nightId: string) =>
  `dwd.mobile.photo-task.v1:${owner}:${nightId}`;
export const photoObjectPath = (task: Pick<PhotoTask, 'nightId' | 'owner' | 'id'>) =>
  `${task.nightId}/${task.owner}/${task.id}.jpg`;
export function readPhotoTask(storage: Pick<Storage, 'getItem'>, owner: string, nightId: string) {
  const raw = storage.getItem(photoTaskKey(owner, nightId));
  if (!raw) return null;
  const task = photoTaskSchema.parse(JSON.parse(raw));
  if (task.owner !== owner || task.nightId !== nightId)
    throw new Error('Photo belongs to another account or night.');
  return task;
}
export function photoSlots(photos: NightPhoto[], owner: string, pending: PhotoTask | null) {
  const own = photos.filter((photo) => photo.uploadedByUserId === owner);
  return Math.max(
    0,
    MAX_PHOTOS_PER_PERSON_PER_NIGHT -
      own.length -
      (pending && !own.some((p) => p.id === pending.id) ? 1 : 0),
  );
}
export async function savePhotoTask(
  client: SupabaseClient<Database>,
  task: PhotoTask,
  readBytes: () => Promise<ArrayBuffer>,
) {
  const bucket = client.storage.from('night-memories');
  const path = photoObjectPath(task);
  // A prior upload may have committed even if its response was lost. Check the
  // exact object before uploading; upsert would require broader Storage grants.
  const { data, error } = await bucket.list(`${task.nightId}/${task.owner}`, {
    search: `${task.id}.jpg`,
  });
  if (error) throw error;
  if (!data.some((object) => object.name === `${task.id}.jpg`)) {
    const bytes = await readBytes();
    if (bytes.byteLength !== task.byteSize)
      throw new Error('The saved photo changed. Remove this upload and choose it again.');
    const { error: uploadError } = await bucket.upload(path, bytes, {
      contentType: 'image/jpeg',
      upsert: false,
    });
    if (uploadError) throw uploadError;
  }
  return registerNightPhoto(client, {
    id: task.id,
    nightId: task.nightId,
    objectPath: path,
    mimeType: 'image/jpeg',
    byteSize: task.byteSize,
    width: task.width,
    height: task.height,
  });
}
export async function removePhoto(
  client: SupabaseClient<Database>,
  id: string,
  objectPath: string,
) {
  // Keep metadata until Storage removal succeeds: DELETE also needs SELECT.
  const { error } = await client.storage.from('night-memories').remove([objectPath]);
  if (error) throw error;
  await deleteNightPhoto(client, id);
}
export async function discardPhotoTask(client: SupabaseClient<Database>, task: PhotoTask) {
  const { error } = await client.storage.from('night-memories').remove([photoObjectPath(task)]);
  if (error) throw error;
  // A draft can have no metadata yet, or a registration whose response was lost.
  const photos = await getNightPhotos(client, task.nightId);
  if (photos.some((photo) => photo.id === task.id)) await deleteNightPhoto(client, task.id);
}
