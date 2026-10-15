import { MAX_PHOTO_BYTES, MAX_PHOTO_EDGE } from './photo-contracts';

function encode(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob?.size ? resolve(blob) : reject(new Error('This browser could not prepare the photo.')),
      'image/jpeg',
      quality,
    ),
  );
}
async function decode(blob: Blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return {
        source: bitmap as CanvasImageSource,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      /* Try the browser's image decoder, including native HEIC on Safari. */
    }
  }
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    return {
      source: image as CanvasImageSource,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}
export async function prepareEventPhoto(file: File) {
  const heic = /\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/i.test(file.type);
  if (
    !heic &&
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) &&
    !(file.type === '' && /\.(jpe?g|png|webp)$/i.test(file.name))
  ) {
    throw new Error(
      'Choose a JPEG, PNG, WebP or HEIC photo. Videos, GIFs and other formats are not supported.',
    );
  }
  if (file.size > 50 * 1024 * 1024)
    throw new Error('Choose a photo smaller than 50 MB before preparation.');
  let decoded: Awaited<ReturnType<typeof decode>>;
  try {
    decoded = await decode(file);
  } catch {
    if (!heic)
      throw new Error(
        'This photo could not be opened. Choose a different JPEG, PNG or WebP photo.',
      );
    try {
      const { heicTo } = await import('heic-to/csp');
      decoded = await decode(await heicTo({ blob: file, type: 'image/jpeg', quality: 0.9 }));
    } catch {
      throw new Error(
        'This HEIC photo could not be converted here. Export it as JPEG in Photos and try again.',
      );
    }
  }
  const canvas = document.createElement('canvas');
  try {
    if (!decoded.width || !decoded.height || decoded.width * decoded.height > 60_000_000)
      throw new Error('Choose a photo with fewer than 60 megapixels.');
    let edge = Math.min(MAX_PHOTO_EDGE, Math.max(decoded.width, decoded.height));
    let output: Blob | undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      const scale = edge / Math.max(decoded.width, decoded.height);
      canvas.width = Math.max(1, Math.round(decoded.width * scale));
      canvas.height = Math.max(1, Math.round(decoded.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('This browser cannot prepare photos.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.88, 0.8, 0.7, 0.6]) {
        output = await encode(canvas, quality);
        if (output.size <= 1024 * 1024) break;
      }
      if (output && output.size <= MAX_PHOTO_BYTES) break;
      edge = Math.max(640, Math.round(edge * 0.75));
    }
    if (!output || output.type !== 'image/jpeg' || output.size > MAX_PHOTO_BYTES)
      throw new Error('This photo could not be compressed to 2 MB. Choose a smaller photo.');
    // Canvas encoding discards camera metadata; the server independently normalizes it.
    const hash = await crypto.subtle.digest('SHA-256', await output.arrayBuffer());
    return {
      blob: output,
      fingerprint: Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join(
        '',
      ),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    decoded.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}
