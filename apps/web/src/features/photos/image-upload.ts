export interface PreparedImage {
  blob: Blob;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  width: number;
  height: number;
  extension: '.jpg' | '.png' | '.webp';
}

const MAX_EDGE = 1920;
const MAX_BYTES = 10 * 1024 * 1024;

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/') && !/\.(?:heic|heif|jpe?g|png|webp)$/i.test(file.name)) {
    throw new Error('Choose an image file.');
  }
  const decoded = await decodeImage(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot prepare the photo.');
    context.drawImage(decoded.source, 0, 0, width, height);
    const preferred: PreparedImage['mimeType'] =
      file.type === 'image/png' && file.size < 2 * 1024 * 1024 ? 'image/png' : 'image/webp';
    let blob = await canvasBlob(canvas, preferred, preferred === 'image/webp' ? 0.82 : undefined);
    let mimeType: PreparedImage['mimeType'] = preferred;
    if (blob.type !== preferred) {
      blob = await canvasBlob(canvas, 'image/jpeg', 0.82);
      mimeType = 'image/jpeg';
    }
    if (blob.size > MAX_BYTES) throw new Error('This photo is still too large after resizing.');
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
        blob ? resolve(blob) : reject(new Error('This browser cannot prepare the photo.')),
      type,
      quality,
    ),
  );
}
