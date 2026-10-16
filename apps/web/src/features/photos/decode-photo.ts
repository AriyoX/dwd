// JPEG first lets Apple's photo picker transcode HEIC using the device's codec.
// Original HEIC files selected through Files still have a decoder fallback below.
export const PHOTO_INPUT_ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 60_000_000;

interface DecodedPhoto {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

function imageType(bytes: ArrayBuffer) {
  const header = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 256));
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return 'image/jpeg';
  if (header[0] === 0x89 && String.fromCharCode(...header.subarray(1, 8)) === 'PNG\r\n\x1a\n')
    return 'image/png';
  const text = (start: number, end: number) => String.fromCharCode(...header.subarray(start, end));
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'image/webp';
  if (header.length >= 16 && text(4, 8) === 'ftyp') {
    const boxSize = new DataView(bytes).getUint32(0);
    const brands = [text(8, 12)];
    for (let offset = 16; offset + 4 <= Math.min(boxSize, header.length); offset += 4)
      brands.push(text(offset, offset + 4));
    // AVIF also uses mif1; it must not be sent to the HEVC decoder.
    if (brands.some((brand) => ['avif', 'avis'].includes(brand))) return;
    if (
      brands.some((brand) =>
        ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'].includes(
          brand,
        ),
      )
    )
      return 'image/heic';
  }
}

function bitmapPhoto(bitmap: ImageBitmap): DecodedPhoto {
  return {
    source: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    close: () => bitmap.close(),
  };
}

async function nativePhoto(blob: Blob): Promise<DecodedPhoto> {
  if (typeof createImageBitmap === 'function') {
    try {
      return bitmapPhoto(await createImageBitmap(blob, { imageOrientation: 'from-image' }));
    } catch {
      // Safari can support a camera format in <img> before ImageBitmap supports it.
    }
  }
  const url = URL.createObjectURL(blob);
  const image = new Image();
  const close = () => {
    image.onload = null;
    image.onerror = null;
    image.removeAttribute('src');
    URL.revokeObjectURL(url);
  };
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Image decoding failed.'));
      image.src = url;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close };
  } catch (error) {
    close();
    throw error;
  }
}

export async function decodePhoto(file: File): Promise<DecodedPhoto> {
  if (file.size > MAX_SOURCE_BYTES)
    throw new Error('Choose a photo smaller than 50 MB before preparation.');
  if (!file.size) throw new Error('This photo is empty. Choose it again from your photo library.');
  let bytes: ArrayBuffer;
  try {
    // Read each selected file once, while the picker still owns it. A new Blob
    // also avoids handing Safari's temporary disk-backed File to its decoders.
    bytes = await file.arrayBuffer();
  } catch {
    throw new Error('This photo could not be read. Choose it again from your photo library.');
  }
  const detected = imageType(bytes);
  const heic = detected
    ? detected === 'image/heic'
    : /\.(heic|heif)$/i.test(file.name) || /^image\/hei[cf](?:-sequence)?$/i.test(file.type);
  if (
    !detected &&
    !heic &&
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) &&
    !(file.type === '' && /\.(jpe?g|png|webp)$/i.test(file.name))
  )
    throw new Error('Choose a JPEG, PNG, WebP or HEIC photo.');
  const blob = new Blob([bytes], { type: detected ?? file.type });
  let decoded: DecodedPhoto;
  try {
    decoded = await nativePhoto(blob);
  } catch {
    if (!heic)
      throw new Error('This photo could not be opened. Choose it again from your photo library.');
    try {
      const { heicTo } = await import('heic-to/csp');
      // A full-resolution intermediate canvas can exceed iPhone canvas limits
      // (48 MP photos in particular). Decode directly to a bitmap, then resize
      // on the caller's small canvas without encoding and decoding a second JPEG.
      decoded =
        typeof createImageBitmap === 'function'
          ? bitmapPhoto(await heicTo({ blob, type: 'bitmap' }))
          : await nativePhoto(await heicTo({ blob, type: 'image/jpeg', quality: 0.9 }));
    } catch {
      throw new Error(
        'This HEIC photo could not be opened. Choose it again from your photo library.',
      );
    }
  }
  if (!decoded.width || !decoded.height || decoded.width * decoded.height > MAX_SOURCE_PIXELS) {
    decoded.close();
    throw new Error('Choose a photo with fewer than 60 megapixels.');
  }
  return decoded;
}
