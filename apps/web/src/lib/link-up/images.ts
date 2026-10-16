import 'server-only';
import sharp from 'sharp';
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTO_EDGE,
  MAX_THUMBNAIL_BYTES,
} from '@/features/events/photo-contracts';
import { PhotoError } from './errors';

export async function normalizePhoto(bytes: Buffer, expectedType: string) {
  if (!bytes.length || bytes.length > MAX_PHOTO_BYTES)
    throw new PhotoError('invalid_image', 'Photos must be 4 MB or smaller after preparation.');
  try {
    const image = sharp(bytes, {
      failOn: 'warning',
      limitInputPixels: MAX_PHOTO_EDGE * MAX_PHOTO_EDGE,
      animated: false,
    });
    const metadata = await image.metadata();
    const types: Record<string, string> = {
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    };
    if (
      types[metadata.format] !== expectedType ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > MAX_PHOTO_EDGE ||
      metadata.height > MAX_PHOTO_EDGE ||
      (metadata.pages ?? 1) > 1
    ) {
      throw new Error('unsupported');
    }
    // Sharp discards EXIF/XMP/ICC by default. Auto-orient before discarding metadata.
    const normalized = image
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize({
        width: MAX_PHOTO_EDGE,
        height: MAX_PHOTO_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toColourspace('srgb');
    let output = await normalized
      .clone()
      .jpeg({ quality: 94, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    for (const quality of [90, 86, 80, 70, 60]) {
      if (output.data.length <= MAX_PHOTO_BYTES) break;
      output = await normalized
        .clone()
        .jpeg({ quality, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
    }
    let thumbnail = Buffer.alloc(0);
    for (const edge of [640, 480]) {
      const preview = sharp(output.data).resize({
        width: edge,
        height: edge,
        fit: 'inside',
        withoutEnlargement: true,
      });
      for (const quality of [84, 78, 72, 64]) {
        thumbnail = await preview.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
        if (thumbnail.length <= MAX_THUMBNAIL_BYTES) break;
      }
      if (thumbnail.length <= MAX_THUMBNAIL_BYTES) break;
    }
    if (output.data.length > MAX_PHOTO_BYTES || thumbnail.length > MAX_THUMBNAIL_BYTES)
      throw new Error('size');
    return { image: output.data, thumbnail, width: output.info.width, height: output.info.height };
  } catch {
    throw new PhotoError(
      'invalid_image',
      'This photo is corrupt or unsupported. Choose a JPEG, PNG or WebP photo.',
    );
  }
}
