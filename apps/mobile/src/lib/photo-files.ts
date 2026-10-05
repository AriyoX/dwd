import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { MAX_MEMORY_PHOTO_BYTES } from '@dwd/core';
import { z } from 'zod';
import { photoTaskSchema, type PhotoTask } from './photo-upload';

function photoDirectory(owner: string) {
  return new Directory(Paths.document, 'dwd-photo-uploads', z.uuid().parse(owner));
}
export function photoFile(task: PhotoTask) {
  return new File(photoDirectory(task.owner), `${z.uuid().parse(task.id)}.jpg`);
}
export function removeLocalPhoto(task: PhotoTask) {
  const file = photoFile(task);
  if (file.exists) file.delete();
}
export function clearAccountPhotoFiles(owner: string) {
  const directory = photoDirectory(owner);
  if (directory.exists) directory.delete();
}
export async function preparePhoto(
  uri: string,
  identity: Pick<PhotoTask, 'id' | 'nightId' | 'owner'>,
) {
  const context = ImageManipulator.manipulate(uri);
  let original: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
  try {
    original = await context.renderAsync();
    if (Math.max(original.width, original.height) > 2048) {
      context.resize(original.width >= original.height ? { width: 2048 } : { height: 2048 });
    }
    const image = await context.renderAsync();
    try {
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
      const temporary = new File(saved.uri);
      try {
        if (!temporary.size || temporary.size > MAX_MEMORY_PHOTO_BYTES)
          throw new Error('This photo is too large. Choose a smaller photo (up to 5 MB).');
        const task = photoTaskSchema.parse({
          version: 1,
          ...identity,
          width: saved.width,
          height: saved.height,
          byteSize: temporary.size,
        });
        photoDirectory(task.owner).create({ intermediates: true, idempotent: true });
        temporary.copy(photoFile(task));
        return task;
      } finally {
        if (temporary.exists) temporary.delete();
      }
    } finally {
      image.release();
    }
  } finally {
    original?.release();
    context.release();
  }
}
