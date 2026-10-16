import { MAX_PHOTO_BYTES, MAX_PHOTO_EDGE } from './photo-contracts';
import { decodePhoto } from '../photos/decode-photo';

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
export async function prepareEventPhoto(file: File) {
  const decoded = await decodePhoto(file);
  const canvas = document.createElement('canvas');
  try {
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
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
      // Keep the most detail that fits the actual upload allowance.
      for (const quality of [0.94, 0.9, 0.86, 0.8]) {
        output = await encode(canvas, quality);
        if (output.size <= MAX_PHOTO_BYTES) break;
      }
      if (output && output.size <= MAX_PHOTO_BYTES) break;
      edge = Math.max(640, Math.round(edge * 0.75));
    }
    if (!output || output.type !== 'image/jpeg' || output.size > MAX_PHOTO_BYTES)
      throw new Error('This photo could not be compressed to 4 MB. Choose a smaller photo.');
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
