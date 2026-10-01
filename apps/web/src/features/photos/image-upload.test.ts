import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_MEMORY_PHOTO_BYTES } from '@dwd/core';
import { prepareImage } from './image-upload';

function browserEncoder(
  encode: (type: string, quality: number | undefined, width: number) => Blob | null,
) {
  const close = vi.fn();
  const drawImage = vi.fn();
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage }),
    toBlob: vi.fn((callback: BlobCallback, type: string = 'image/png', quality?: number) => {
      callback(encode(type, quality, canvas.width));
    }),
  };
  vi.stubGlobal('document', { createElement: () => canvas });
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(() => Promise.resolve({ width: 4000, height: 3000, close })),
  );
  return { canvas, close };
}

function encoded(size: number, type: string) {
  return new Blob([new Uint8Array(size)], { type });
}

afterEach(() => vi.unstubAllGlobals());

describe('photo compression', () => {
  it('compresses a source above 5 MB and keeps the output within the limit', async () => {
    const browser = browserEncoder((type) => encoded(300_000, type));
    const image = await prepareImage(
      new File([new Uint8Array(MAX_MEMORY_PHOTO_BYTES + 1)], 'large.png', { type: 'image/png' }),
    );
    expect(image.blob.size).toBeLessThanOrEqual(MAX_MEMORY_PHOTO_BYTES);
    expect(image.width).toBe(1920);
    expect(image.height).toBe(1440);
    expect(browser.close).toHaveBeenCalledOnce();
  });

  it('accepts output exactly at 5 MB', async () => {
    browserEncoder((type) => encoded(MAX_MEMORY_PHOTO_BYTES, type));
    const image = await prepareImage(new File(['image'], 'photo.png', { type: 'image/png' }));
    expect(image.blob.size).toBe(MAX_MEMORY_PHOTO_BYTES);
  });

  it('reduces quality until a large encoded image fits', async () => {
    const browser = browserEncoder((type, quality) =>
      encoded(
        quality !== undefined && quality <= 0.62 ? 4_000_000 : MAX_MEMORY_PHOTO_BYTES + 1,
        type,
      ),
    );
    const image = await prepareImage(new File(['image'], 'photo.jpg', { type: 'image/jpeg' }));
    expect(image.blob.size).toBe(4_000_000);
    expect(image.mimeType).toBe('image/jpeg');
    expect(image.extension).toBe('.jpg');
    expect(browser.canvas.toBlob.mock.calls.some((call) => call[2] === 0.62)).toBe(true);
  });

  it('tries smaller dimensions when quality changes cannot fit the photo', async () => {
    browserEncoder((type, _quality, width) =>
      encoded(width <= 1440 ? 4_000_000 : MAX_MEMORY_PHOTO_BYTES + 1, type),
    );
    const image = await prepareImage(new File(['image'], 'photo.jpg', { type: 'image/jpeg' }));
    expect(image.width).toBe(1440);
    expect(image.height).toBe(1080);
    expect(image.blob.size).toBeLessThanOrEqual(MAX_MEMORY_PHOTO_BYTES);
  });

  it('rejects when all compression attempts still exceed 5 MB and releases the bitmap', async () => {
    const browser = browserEncoder((type) => encoded(MAX_MEMORY_PHOTO_BYTES + 1, type));
    await expect(
      prepareImage(new File(['image'], 'photo.jpg', { type: 'image/jpeg' })),
    ).rejects.toThrow('could not be compressed to 5 MB');
    expect(browser.close).toHaveBeenCalledOnce();
  });

  it('uses the actual MIME type when a browser falls back from WebP to JPEG', async () => {
    browserEncoder((type) => encoded(1000, type === 'image/webp' ? 'image/png' : type));
    const image = await prepareImage(new File(['image'], 'photo.jpg', { type: 'image/jpeg' }));
    expect(image.mimeType).toBe('image/jpeg');
    expect(image.extension).toBe('.jpg');
  });

  it('rejects failed encoding and frees the decoded bitmap', async () => {
    const browser = browserEncoder(() => null);
    await expect(
      prepareImage(new File(['image'], 'photo.jpg', { type: 'image/jpeg' })),
    ).rejects.toThrow('cannot prepare the photo');
    expect(browser.close).toHaveBeenCalledOnce();
  });

  it('rejects an empty encoded image before upload', async () => {
    browserEncoder((type) => encoded(0, type));
    await expect(
      prepareImage(new File(['image'], 'photo.jpg', { type: 'image/jpeg' })),
    ).rejects.toThrow('cannot prepare the photo');
  });
});
