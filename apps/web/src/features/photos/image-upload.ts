import { MAX_MEMORY_PHOTO_BYTES } from '@dwd/core';

export interface PreparedImage {
  blob: Blob;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  width: number;
  height: number;
  extension: '.jpg' | '.png' | '.webp';
}

const MAX_EDGE = 1920;

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/') && !/\.(?:heic|heif|jpe?g|png|webp)$/i.test(file.name)) {
    throw new Error('Choose an image file.');
  }
  const decoded = await decodeImage(file);
  try {
    if (decoded.width * decoded.height > 40_000_000) {
      throw new Error('Choose a photo with fewer than 40 megapixels.');
    }
    const scale = Math.min(1, MAX_EDGE / Math.max(decoded.width, decoded.height));
    let width = Math.max(1, Math.round(decoded.width * scale));
    let height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot prepare the photo.');
    const draw = () => {
      canvas.width = width;
      canvas.height = height;
      context.drawImage(decoded.source, 0, 0, width, height);
    };
    draw();
    const preferred: PreparedImage['mimeType'] =
      file.type === 'image/png' && file.size <= MAX_MEMORY_PHOTO_BYTES ? 'image/png' : 'image/webp';
    let blob = await canvasBlob(canvas, preferred, preferred === 'image/webp' ? 0.82 : undefined);
    if (blob.type !== preferred) {
      blob = await canvasBlob(canvas, 'image/jpeg', 0.82);
    }
    // Try lower quality first, then smaller dimensions. Stop as soon as it fits.
    // Bound resizing to a 960px edge so failed encoders cannot cause an endless loop.
    const firstEdge = Math.max(width, height);
    const smallestEdge = Math.min(960, firstEdge);
    const edges = [
      ...new Set([firstEdge, Math.max(smallestEdge, Math.round(firstEdge * 0.75)), smallestEdge]),
    ];
    for (const edge of edges) {
      if (blob.size <= MAX_MEMORY_PHOTO_BYTES) break;
      width = Math.max(
        1,
        Math.round(decoded.width * (edge / Math.max(decoded.width, decoded.height))),
      );
      height = Math.max(
        1,
        Math.round(decoded.height * (edge / Math.max(decoded.width, decoded.height))),
      );
      draw();
      for (const quality of [0.78, 0.62, 0.46]) {
        blob = await canvasBlob(canvas, 'image/jpeg', quality);
        if (blob.size <= MAX_MEMORY_PHOTO_BYTES) break;
      }
    }
    if (blob.size > MAX_MEMORY_PHOTO_BYTES) {
      throw new Error('This photo could not be compressed to 5 MB. Choose a smaller photo.');
    }
    const mimeType = blob.type;
    if (mimeType !== 'image/jpeg' && mimeType !== 'image/png' && mimeType !== 'image/webp') {
      throw new Error('This browser cannot prepare the photo.');
    }
    return {
      blob,
      mimeType,
      width,
      height,
      extension: mimeType === 'image/png' ? '.png' : mimeType === 'image/webp' ? '.webp' : '.jpg',
    };
  } finally {
    decoded.close();
  }
}

async function decodeImage(file: File): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // Safari can decode some camera formats through an image element even
      // when createImageBitmap rejects them.
    }
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (cause) {
    URL.revokeObjectURL(url);
    throw cause;
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob && blob.size > 0
          ? resolve(blob)
          : reject(new Error('This browser cannot prepare the photo.')),
      type,
      quality,
    ),
  );
}
